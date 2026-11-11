import { DatePipe, Location } from '@angular/common';
import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { EMPTY, Observable, catchError, filter, switchMap, tap } from 'rxjs';
import {
  AI_TONES,
  AiDraft,
  POST_IMAGE_MAX_BYTES,
  POST_IMAGE_TYPES,
  POST_STATUS,
  Post,
  PostStatus,
} from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import {
  ConfirmDialogData,
  ConfirmService,
} from '../../../shared/components/confirm-dialog/confirm-dialog';
import { StatusPill } from '../../../shared/components/status-pill/status-pill';
import { AutofocusDirective } from '../../../shared/directives/autofocus.directive';
import { CharCountDirective } from '../../../shared/directives/char-count.directive';
import { AiSummary } from '../ai-summary/ai-summary';
import { PostComments } from '../comments/post-comments';
import { PostService } from '../post.service';
import { ReviewNote } from '../review-note/review-note';
import postActions from './post-actions.json';

/** One button from post-actions.json. */
interface ActionButton {
  label: string;
  /** Name of the handler to call — must be a key of `handlers` in PostEditorPage. */
  functionName: string;
  style: 'primary' | 'success' | 'warning' | 'danger' | 'outline' | 'outline-danger';
  icon?: string;
  /** Hide on /posts/new (e.g. Delete, Approve — they need a saved post). */
  existingOnly?: boolean;
  /** Hide while the form is locked by status (e.g. Save/Submit on a pending post). */
  editableOnly?: boolean;
  /** Show only when the post is in one of these statuses (a new post counts as "draft"). */
  statuses?: PostStatus[];
  /** "Are you sure?" popup shown before the action runs. `{title}` → the post's title. */
  confirm?: Omit<ConfirmDialogData, 'danger' | 'confirmClass'>;
}

/** Buttons that check the form before asking "Are you sure?". */
const VALIDATE_FIRST = new Set(['save', 'submit']);

interface RoleConfig {
  readOnly: boolean;
  /** Statuses in which this role may edit an existing post (new posts are always editable). */
  editableStatuses?: PostStatus[];
  buttons: ActionButton[];
}

/** Role-wise buttons and form mode, kept in JSON so they can change without touching the template. */
const ROLE_CONFIG = postActions as Record<string, RoleConfig>;
/** Unknown or missing role → read-only with no buttons (safest default). */
const NO_ACCESS: RoleConfig = { readOnly: true, buttons: [] };

/** `style` in post-actions.json → CSS class (defined in tailwind.css). */
const STYLE_CLASS: Record<ActionButton['style'], string> = {
  primary: 'btn-primary', //      blue
  success: 'btn-success', //      green
  warning: 'btn-warning', //      amber
  danger: 'btn-danger', //        red
  outline: 'btn-outline', //      white, neutral
  'outline-danger': 'btn-outline hover:!text-red-600',
};

/**
 * Create (`/posts/new`) and open (`/posts/:id`) a post. Buttons and read-only mode come from
 * post-actions.json, per role (creator / admin / user).
 */
@Component({
  selector: 'app-post-editor-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    DatePipe,
    NgIcon,
    StatusPill,
    ReviewNote,
    AiSummary,
    PostComments,
    AutofocusDirective,
    CharCountDirective,
  ],
  templateUrl: './post-editor-page.html',
})
export class PostEditorPage {
  private readonly postsApi = inject(PostService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly notify = inject(NotificationService);
  private readonly confirm = inject(ConfirmService);
  private readonly auth = inject(AuthService);
  readonly id = input<string>();
  /** `?topic=` from the chat assistant ("Open editor") → opens Write with AI with it filled in. */
  readonly topic = input<string>();

  protected readonly post = signal<Post | null>(null);
  protected readonly busy = signal(false);

  /**
   * `functionName` in post-actions.json → method that runs. To add a button: add an entry
   * here, then reference its name in the JSON.
   */
  private readonly handlers: Record<string, (comment: string) => void> = {
    cancel: () => this.cancel(),
    save: () => this.save(),
    submit: () => this.submit(),
    delete: () => this.delete(),
    // Workflow — PATCH /feed/posts/:id/<action>
    close: () => this.workflow((id) => this.postsApi.close(id), 'Post closed'),
    approve: () => this.workflow((id) => this.postsApi.approve(id), 'Post approved and published'),
    reject: (comment) => this.workflow((id) => this.postsApi.reject(id, comment), 'Post rejected'),
    sendBack: (comment) =>
      this.workflow(
        (id) => this.postsApi.sendBack(id, comment),
        'Sent back to the creator for clarification',
      ),
  };

  private readonly roleConfig = computed(() => ROLE_CONFIG[this.auth.role() ?? ''] ?? NO_ACCESS);
  /** Status locks the form, e.g. a creator can't edit a pending or published post. */
  protected readonly lockedByStatus = computed(() => {
    const post = this.post();
    const editable = this.roleConfig().editableStatuses;
    return !!post && !!editable && !editable.includes(post.status);
  });
  protected readonly statusLabel = computed(() => {
    const status = this.post()?.status;
    return status ? POST_STATUS[status].label : '';
  });
  protected readonly readOnly = computed(() => this.roleConfig().readOnly || this.lockedByStatus());
  protected readonly isAdmin = computed(() => this.auth.role() === 'admin');

  /** Buttons for the current role, minus ones that don't apply (new post / locked form). */
  protected readonly buttons = computed(() =>
    this.roleConfig()
      .buttons.filter((b) => !b.existingOnly || !!this.post())
      .filter((b) => !b.editableOnly || !this.readOnly())
      .filter((b) => !b.statuses || b.statuses.includes(this.post()?.status ?? 'draft'))
      .filter((b) => {
        const known = b.functionName in this.handlers;
        if (!known) console.warn(`post-actions.json: no handler for "${b.functionName}"`);
        return known;
      }),
  );

  protected buttonClass(button: ActionButton): string {
    return `btn ${STYLE_CLASS[button.style] ?? 'btn-outline'}`;
  }

  /**
   * Called by every button: (1) Save/Submit check the form first, (2) shows the JSON `confirm`
   * popup if there is one, (3) runs the handler named by `functionName`.
   */
  protected trigger(button: ActionButton): void {
    const handler = this.handlers[button.functionName];
    if (!handler) return;
    if (VALIDATE_FIRST.has(button.functionName) && !this.validate()) return;

    if (!button.confirm) {
      handler('');
      return;
    }
    const title = this.post()?.title || this.form.controls.title.value || 'this post';
    this.confirm
      .open({
        ...button.confirm,
        title: button.confirm.title.replaceAll('{title}', title),
        message: button.confirm.message.replaceAll('{title}', title),
        // The "Yes" button gets the same colour as the button that was clicked.
        confirmClass: STYLE_CLASS[button.style] ?? 'btn-primary',
      })
      .pipe(filter((result) => !!result))
      .subscribe((result) => handler(result.comment));
  }

  protected readonly form = inject(NonNullableFormBuilder).group({
    title: ['', [Validators.required, Validators.maxLength(140)]],
    content: ['', Validators.required],
  });

  // ---- AI draft (POST /feed/ai/generate-post, creator only) ----------------------

  protected readonly aiTones = AI_TONES;
  /** Same limits as the backend validator in routes/feed.js. */
  protected readonly aiForm = inject(NonNullableFormBuilder).group({
    topic: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(200)]],
    tone: [AI_TONES[0] as string],
    keywords: ['', Validators.maxLength(200)],
  });
  protected readonly aiOpen = signal(false);
  protected readonly aiBusy = signal(false);
  /** Only creators may call the endpoint, and only while the form is editable. */
  protected readonly canGenerate = computed(
    () => this.auth.role() === 'creator' && !this.readOnly(),
  );

  /** Asks the AI for a title + content, then fills the form (after confirming an overwrite). */
  protected generateDraft(): void {
    if (this.aiForm.invalid) {
      this.aiForm.markAllAsTouched();
      return;
    }
    const { topic, tone, keywords } = this.aiForm.getRawValue();
    this.aiBusy.set(true);
    this.postsApi
      .generateDraft({
        topic: topic.trim(),
        tone: tone as (typeof AI_TONES)[number],
        keywords: keywords.trim() || undefined,
      })
      .subscribe({
        next: (draft) => {
          this.aiBusy.set(false);
          this.applyDraft(draft);
        },
        error: () => this.aiBusy.set(false), // toast comes from the error interceptor
      });
  }

  private applyDraft(draft: AiDraft): void {
    const { title, content } = this.form.getRawValue();
    const fill = () => {
      this.form.setValue({ title: draft.title, content: draft.content });
      this.form.markAsDirty();
      this.aiOpen.set(false);
      this.notify.success('AI draft added — review it, add an image, then save.');
    };
    if (!title.trim() && !content.trim()) {
      fill();
      return;
    }
    this.confirm
      .open({
        title: 'Replace current text?',
        message: 'The AI draft will replace the title and content you have now.',
        confirmText: 'Yes, replace',
        cancelText: 'Keep mine',
      })
      .pipe(filter((result) => !!result))
      .subscribe(fill);
  }

  // Image — kept outside the reactive form: a file input doesn't map well onto a FormControl.
  protected readonly acceptTypes = POST_IMAGE_TYPES.join(',');
  protected readonly imageFile = signal<File | null>(null);
  protected readonly imageError = signal<string | null>(null);
  private readonly localPreview = signal<string | null>(null);
  /** New file's preview if one was chosen, otherwise the post's current image (edit mode). */
  protected readonly previewUrl = computed(() => this.localPreview() ?? this.post()?.imageUrl);

  constructor() {
    // A draft written by the chat assistant ("Open in editor") arrives in the navigation state.
    // Read it now: the navigation is only "current" while this page is being created.
    const chatDraft = this.router.currentNavigation()?.extras.state?.['draft'] as
      { title?: string; content?: string } | undefined;

    effect(() => {
      const id = this.id();
      untracked(() => {
        if (id) {
          this.load(id);
          return;
        }
        this.post.set(null);
        if (chatDraft?.title || chatDraft?.content) {
          this.form.patchValue({ title: chatDraft.title ?? '', content: chatDraft.content ?? '' });
          this.form.markAsDirty();
        }
      });
    });

    // Coming from the chat with a topic → open the AI panel, ready to generate.
    effect(() => {
      const topic = this.topic()?.trim();
      if (!topic || !this.canGenerate()) return;
      untracked(() => {
        this.aiForm.controls.topic.setValue(topic.slice(0, 200));
        this.aiOpen.set(true);
      });
    });

    // Lock the form for anyone who isn't a creator.
    effect(() => (this.readOnly() ? this.form.disable() : this.form.enable()));

    // Release the in-memory preview URL when leaving the page.
    inject(DestroyRef).onDestroy(() => this.setPreview(null));
  }

  protected onImageSelected(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = ''; // so picking the same file again still fires (change)
    if (!file) return;

    if (!POST_IMAGE_TYPES.includes(file.type)) {
      this.imageError.set('Only PNG or JPG images are allowed.');
      return;
    }
    if (file.size > POST_IMAGE_MAX_BYTES) {
      this.imageError.set('Image must be 2 MB or smaller.');
      return;
    }

    this.imageError.set(null);
    this.imageFile.set(file);
    this.setPreview(URL.createObjectURL(file));
  }

  /** Drop the newly chosen file and go back to the current image (or empty, when creating). */
  protected clearImage(): void {
    this.imageFile.set(null);
    this.imageError.set(null);
    this.setPreview(null);
  }

  // ---- creator ----------------------------------------------------------------

  /** Cancel: leave without saving. */
  protected cancel(): void {
    this.location.back();
  }

  /** Save: store changes. New posts start as drafts; existing posts keep their status. */
  protected save(): void {
    this.persist(this.post()?.status ?? 'draft', this.id() ? 'Post saved' : 'Draft saved');
  }

  /**
   * Submit: save the latest edits (create the post first if it's new), then
   * PATCH /feed/posts/:id/submit → pending.
   */
  protected submit(): void {
    if (!this.validate()) return;
    this.run(
      this.saveRequest(this.post()?.status ?? 'draft').pipe(
        switchMap((saved) => this.postsApi.submit(saved.id)),
      ),
    ).subscribe(() => this.finish('Post submitted — pending approval'));
  }

  /** Delete: the "Are you sure?" popup comes from post-actions.json (see trigger()). */
  protected delete(): void {
    const post = this.post();
    if (!post) return;
    this.run(this.postsApi.remove(post.id)).subscribe(() => this.finish('Post deleted'));
  }

  // ---- workflow: Close (owner/admin), Approve / Reject / Send back (admin) -------

  /** Calls one PATCH workflow endpoint for the current post, then returns to the list. */
  private workflow(request: (id: string) => Observable<unknown>, done: string): void {
    const post = this.post();
    if (!post) return;
    this.run(request(post.id)).subscribe(() => this.finish(done));
  }

  // ---- helpers ----------------------------------------------------------------

  /** Shows field errors and returns false if the post can't be saved yet. */
  private validate(): boolean {
    // Image is required when creating, optional when editing (keeps the old one).
    const missingImage = !this.id() && !this.imageFile();
    if (missingImage) this.imageError.set('Image is required.');

    if (this.form.invalid || missingImage) {
      this.form.markAllAsTouched();
      return false;
    }
    return true;
  }

  /** Creates or updates the post with the given status. */
  private persist(status: PostStatus, done: string): void {
    if (!this.validate()) return;
    this.run(this.saveRequest(status)).subscribe(() => this.finish(done));
  }

  /** POST (new) or PUT (existing) the form's title, content and image. */
  private saveRequest(status: PostStatus): Observable<Post> {
    // A new post that was already created (e.g. Submit failed after the create) is updated, not re-created.
    const id = this.post()?.id ?? this.id();
    const image = this.imageFile();
    const dto = { ...this.form.getRawValue(), status };
    const request$ = id ? this.postsApi.update(id, dto, image) : this.postsApi.create(dto, image!);
    return request$.pipe(
      tap((saved) => {
        this.post.set(saved);
        this.clearImage(); // uploaded now; don't send it again on a retry
      }),
    );
  }

  /** Runs a request with the buttons disabled; re-enables them if it fails. */
  private run<T>(request$: Observable<T>): Observable<T> {
    this.busy.set(true);
    return request$.pipe(
      catchError(() => {
        // The error toast is shown by the error interceptor; just unlock the buttons.
        this.busy.set(false);
        return EMPTY;
      }),
    );
  }

  private finish(message: string): void {
    this.notify.success(message);
    void this.router.navigate(['/posts']);
  }

  private setPreview(url: string | null): void {
    const old = this.localPreview();
    if (old) URL.revokeObjectURL(old);
    this.localPreview.set(url);
  }

  private load(id: string): void {
    this.postsApi.getById(id).subscribe((post) => {
      this.post.set(post);
      this.form.setValue({ title: post.title, content: post.content });
    });
  }
}

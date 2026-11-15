import { DecimalPipe } from '@angular/common';
import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { environment } from '../../../../environments/environment';
import {
  CHAT_MESSAGE_MAX,
  ChatAction,
  ChatAwaiting,
  ChatDownload,
  ChatDraft,
  ChatIntent,
  ChatMessage,
  ChatPostLink,
  Post,
} from '../../../core/models';
import { StatusPill } from '../../../shared/components/status-pill/status-pill';
import { AuthService } from '../../../core/services/auth.service';
import { PostService } from '../../posts/post.service';
import { PostViewService } from '../../posts/post-view-dialog/post-view-dialog';
import { ChatDraftCard } from '../chat-draft-card/chat-draft-card';
import { ChatService } from '../chat.service';
import { downloadCsv } from '../csv-download';

/** How each intent is labelled under a bot reply (shows the trained model at work). */
const INTENT_LABEL: Record<ChatIntent, string> = {
  find_posts: 'Find posts',
  summarize_post: 'Summarize',
  create_post: 'Create post',
  post_report: 'Report',
  site_help: 'Help',
  greeting: 'Greeting',
  out_of_scope: 'Out of scope',
  dashboard_summary: 'Dashboard',
};

/** First chips, by role. "…" = goes into the input to finish typing instead of being sent. */
function starters(role: string | undefined): string[] {
  switch (role) {
    case 'creator':
      return [
        'Write a post about…',
        'Status report of my posts',
        'Why was my post rejected?',
        'Summarize the dashboard',
      ];
    case 'admin':
      return [
        'Summarize the dashboard',
        'Status report of all posts',
        'How many posts are pending?',
        'Download all posts as CSV',
      ];
    default:
      return [
        'Show latest posts',
        'Find posts about…',
        'Summarize the latest post',
        'Summarize the dashboard',
      ];
  }
}

/** Next steps after a reply, by its intent. */
function followUps(intent: ChatIntent, role: string | undefined): string[] {
  const canReview = role === 'creator' || role === 'admin';
  switch (intent) {
    case 'find_posts':
      return ['Summarize the latest post', 'Find posts about…', 'How many posts are there?'];
    case 'summarize_post':
      return [
        'Show latest posts',
        'Summarize…',
        ...(role === 'creator' ? ['Write a post about…'] : []),
      ];
    case 'post_report':
      return canReview
        ? ['Download the list as CSV', 'Why was my post rejected?', 'How many posts are pending?']
        : ['Download the list as CSV', 'Show latest posts'];
    case 'create_post':
      return ['How do I add an image?', 'How do I submit for review?'];
    case 'site_help':
      return [
        'What image formats are allowed?',
        'What does clarification mean?',
        'Show latest posts',
      ];
    default:
      return starters(role);
  }
}

/** After a 503 (AI service asleep), wait this long before trying the message once more. */
const RETRY_AFTER_MS = 20000;

const WELCOME =
  'Hi! I can find posts, summarize a post, help you write one, give a status report ' +
  '(e.g. "why was my post rejected?"), or answer questions about the blog.';

/**
 * Floating chat assistant. Sends each message to POST /chat and shows the reply,
 * any matching posts (open in the post popup) and an "Open editor" action for create_post.
 * Lives in MainLayout, so the conversation survives navigation (not page reloads).
 */
@Component({
  selector: 'app-chat-panel',
  imports: [NgIcon, DecimalPipe, StatusPill, ChatDraftCard],
  host: { '(document:keydown.escape)': 'open.set(false)' },
  template: `
    @if (open()) {
      <section
        class="card fixed right-4 bottom-20 z-40 flex h-[520px] max-h-[calc(100vh-7rem)] w-[380px] max-w-[calc(100vw-2rem)] flex-col shadow-xl"
        role="dialog"
        aria-labelledby="chat-title"
      >
        <header class="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <ng-icon name="lucideBot" size="17" class="text-brand" />
          <h2 id="chat-title" class="text-sm font-semibold">WordNest assistant</h2>
          @if (isMock) {
            <span
              class="pill tone-gray"
              title="environment.mock.chat is on: replies are faked in the browser"
            >
              mock
            </span>
          }
          <button
            class="btn-icon ml-auto -mr-1.5"
            aria-label="Close chat"
            (click)="open.set(false)"
          >
            <ng-icon name="lucideX" size="15" />
          </button>
        </header>

        <div #scroller class="flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite">
          @for (m of messages(); track m.id) {
            @if (m.from === 'user') {
              <p
                class="ml-auto w-fit max-w-[85%] rounded-lg rounded-br-sm bg-brand px-3 py-2 text-sm whitespace-pre-line text-brand-fg"
              >
                {{ m.text }}
              </p>
            } @else {
              <div class="max-w-[90%]">
                <p
                  class="w-fit rounded-lg rounded-bl-sm px-3 py-2 text-sm whitespace-pre-line"
                  [class]="
                    m.failed
                      ? 'bg-red-50 text-red-800 dark:bg-red-500/10 dark:text-red-200'
                      : 'bg-surface-2 text-fg'
                  "
                >
                  {{ m.text }}
                </p>

                @if (m.stats?.length) {
                  <table class="mt-1.5 w-full max-w-[240px] text-sm">
                    <tbody>
                      @for (row of m.stats; track row.label) {
                        <tr
                          class="border-b border-line last:border-0"
                          [class.font-semibold]="!row.status"
                        >
                          <td class="py-1 pr-2">
                            @if (row.status) {
                              <app-status-pill [status]="row.status" />
                            } @else {
                              {{ row.label }}
                            }
                          </td>
                          <td class="py-1 text-right tabular-nums">{{ row.count }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                }

                @if (m.download; as file) {
                  <button type="button" class="btn btn-outline mt-1.5" (click)="download(file)">
                    <ng-icon name="lucideDownload" size="14" />
                    Download CSV ({{ file.rows.length }}
                    {{ file.rows.length === 1 ? 'row' : 'rows' }})
                  </button>
                }

                @if (m.posts?.length) {
                  <ul class="mt-1.5 space-y-1">
                    @for (p of m.posts; track p.id) {
                      <li>
                        <button
                          type="button"
                          class="flex w-full items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-left text-sm hover:bg-surface-hover disabled:opacity-50"
                          [disabled]="sending()"
                          (click)="clickPost(p, m)"
                        >
                          <ng-icon
                            [name]="
                              m.postsAction === 'summarize' ? 'lucideSparkles' : 'lucideNewspaper'
                            "
                            size="13"
                            class="shrink-0 text-fg-muted"
                          />
                          <span class="truncate">{{ p.title }}</span>
                        </button>
                      </li>
                    }
                  </ul>
                }

                @if (m.draft?.title) {
                  <app-chat-draft-card
                    [draft]="m.draft!"
                    (saved)="onDraftSaved($event)"
                    (edit)="editDraft($event)"
                    (retry)="retryDraft($event)"
                  />
                }

                @if (m.action?.type === 'open_editor') {
                  <button
                    type="button"
                    class="btn btn-primary mt-1.5"
                    (click)="runAction(m.action!)"
                  >
                    <ng-icon name="lucideSparkles" size="14" />
                    @if (m.action?.postId) {
                      Open in editor to submit
                    } @else {
                      Open editor{{ m.action?.topic ? ': ' + m.action?.topic : '' }}
                    }
                  </button>
                }

                @if (m.intent) {
                  <p
                    class="mt-1 text-2xs text-fg-subtle"
                    title="Detected by the intent model in ai-service"
                  >
                    {{ intentLabel[m.intent] }} · {{ (m.confidence ?? 0) * 100 | number: '1.0-0' }}%
                    sure
                  </p>
                }
              </div>
            }
          }

          @if (sending()) {
            <p
              class="flex w-fit items-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-sm text-fg-muted"
            >
              <ng-icon name="lucideLoaderCircle" size="13" class="animate-spin" />
              Thinking…
            </p>
          }
        </div>

        @if (suggestions().length && !sending()) {
          <div
            class="flex flex-wrap gap-1.5 border-t border-line px-2.5 pt-2"
            aria-label="Suggestions"
          >
            @for (chip of suggestions(); track chip) {
              <button
                type="button"
                class="h-7 rounded-full border border-line bg-surface px-2.5 text-xs text-fg-muted transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand"
                (click)="pick(chip)"
              >
                {{ chip }}
              </button>
            }
          </div>
        }

        <form
          class="flex items-center gap-2 p-2.5"
          [class.border-t]="!suggestions().length || sending()"
          [class.border-line]="!suggestions().length || sending()"
          (submit)="send($event)"
        >
          <input
            #box
            class="input"
            placeholder="Ask about the blog…"
            aria-label="Message"
            [maxLength]="maxLength"
            [value]="draft()"
            (input)="draft.set(box.value)"
          />
          <button
            type="submit"
            class="btn btn-primary h-8 px-2.5"
            aria-label="Send"
            [disabled]="sending() || !draft().trim()"
          >
            <ng-icon name="lucideSendHorizontal" size="15" />
          </button>
        </form>
      </section>
    }

    <button
      type="button"
      class="fixed right-4 bottom-4 z-40 flex size-12 items-center justify-center rounded-full bg-brand text-brand-fg shadow-lg transition-colors hover:bg-brand-hover"
      [attr.aria-label]="open() ? 'Close chat' : 'Open chat assistant'"
      [attr.aria-expanded]="open()"
      (click)="open.set(!open())"
    >
      <ng-icon [name]="open() ? 'lucideX' : 'lucideMessageCircle'" size="22" />
    </button>
  `,
})
export class ChatPanel {
  private readonly chat = inject(ChatService);
  private readonly router = inject(Router);
  private readonly postView = inject(PostViewService);
  private readonly posts = inject(PostService);
  private readonly injector = inject(Injector);
  private readonly auth = inject(AuthService);

  protected readonly isMock = environment.mock.chat;
  protected readonly intentLabel = INTENT_LABEL;
  protected readonly maxLength = CHAT_MESSAGE_MAX;

  protected readonly open = signal(false);
  protected readonly sending = signal(false);
  protected readonly draft = signal('');
  protected readonly messages = signal<ChatMessage[]>([{ id: 0, from: 'bot', text: WELCOME }]);

  /**
   * Chips under the conversation: the backend's `suggestions` if it sent any, otherwise follow-ups
   * for the last reply's intent, otherwise starters for the user's role. Never repeats the last message.
   */
  protected readonly suggestions = computed(() => {
    const list = this.messages();
    const last = list[list.length - 1];
    const lastUserText = [...list]
      .reverse()
      .find((m) => m.from === 'user')
      ?.text.toLowerCase();
    const role = this.auth.role();

    let chips: string[];
    if (last?.from === 'bot' && last.suggestions?.length) chips = last.suggestions;
    else if (last?.from === 'bot' && last.intent && !last.failed)
      chips = followUps(last.intent, role);
    else chips = starters(role);

    return chips.filter((c) => c.toLowerCase() !== lastUserText).slice(0, 4);
  });

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly box = viewChild<ElementRef<HTMLInputElement>>('box');
  private nextId = 1;
  /** The bot's open question from its last reply, sent back with the next message. */
  private awaiting?: ChatAwaiting;
  /** The post being written in the chat (topic, then tone), sent back while the bot is asking. */
  private pendingDraft?: ChatDraft;

  constructor() {
    // Wake the AI service now (the panel is created when the app opens) and again whenever the chat
    // is opened: on the free plan it sleeps when unused and needs ~50 s to start.
    this.chat.warm();
    effect(() => {
      if (this.open()) this.chat.warm(); // throttled in ChatService
    });

    // Keep the newest message in view, and focus the input when the panel opens.
    effect(() => {
      this.messages();
      this.sending();
      if (!this.open()) return;
      afterNextRender(
        () => {
          const el = this.scroller()?.nativeElement;
          if (el) el.scrollTop = el.scrollHeight;
          this.box()?.nativeElement.focus();
        },
        { injector: this.injector },
      );
    });
  }

  protected send(event: Event): void {
    event.preventDefault();
    this.submit(this.draft().trim());
  }

  /**
   * Chip clicked. "…" chips ("Find posts about…") go into the input to finish; the rest are sent.
   * Chips the bot offered as ANSWERS to its question (e.g. the tone chips) keep the question open;
   * any other chip is a new request, so it cancels the open question ("Which post?").
   */
  protected pick(chip: string): void {
    if (chip.endsWith('…')) {
      this.draft.set(chip.slice(0, -1).trimEnd() + ' ');
      this.box()?.nativeElement.focus();
      return;
    }
    const list = this.messages();
    const last = list[list.length - 1];
    const isAnswer = !!this.awaiting && last?.from === 'bot' && !!last.suggestions?.includes(chip);
    if (!isAnswer) {
      this.awaiting = undefined;
      this.pendingDraft = undefined;
    }
    this.submit(chip);
  }

  /** `shown` = what appears in the user's bubble, when it differs from what is sent. */
  private submit(text: string, shown = text): void {
    if (!text || this.sending()) return;

    this.add({ from: 'user', text: shown });
    this.draft.set('');
    this.sending.set(true);

    const awaiting = this.awaiting;
    const pendingDraft = this.pendingDraft;
    this.awaiting = undefined; // a question is answered once
    this.pendingDraft = undefined;
    this.request(text, awaiting, pendingDraft, 1);
  }

  /**
   * Sends one chat message. Attempt 1 is silent on errors: a 503 usually means the AI service was
   * asleep (free plan), so instead of an error the chat says it's waking up and tries once more.
   */
  private request(
    text: string,
    awaiting: ChatAwaiting | undefined,
    pendingDraft: ChatDraft | undefined,
    attempt: 1 | 2,
  ): void {
    this.chat.send(text, awaiting, pendingDraft, attempt === 1).subscribe({
      next: (res) => {
        this.sending.set(false);
        this.awaiting = res.awaiting;
        this.pendingDraft = res.awaiting ? res.draft : undefined;
        this.add({
          from: 'bot',
          text: res.reply,
          intent: res.intent,
          confidence: res.confidence,
          posts: res.posts,
          postsAction: res.postsAction,
          stats: res.stats,
          download: res.download,
          suggestions: res.suggestions,
          action: res.action,
          draft: res.draft,
        });
      },
      error: (err: { status?: number; message?: string }) => {
        if (attempt === 1 && err?.status === 503) {
          this.add({
            from: 'bot',
            text: 'The assistant is waking up (it sleeps when nobody has used it for a while). Trying again in 20 seconds…',
          });
          this.chat.warm(true);
          setTimeout(() => this.request(text, awaiting, pendingDraft, 2), RETRY_AFTER_MS);
          return; // still "Thinking…"
        }
        // Keep the text so the user can retry. On attempt 1 (other errors) show the backend's message,
        // since that request skipped the error toast.
        this.sending.set(false);
        this.awaiting = awaiting;
        this.pendingDraft = pendingDraft;
        this.draft.set(text);
        this.add({
          from: 'bot',
          text:
            attempt === 1 && err?.message
              ? `Sorry, I couldn't answer that: ${err.message}`
              : "Sorry, I couldn't answer that. Please try again.",
          failed: true,
        });
      },
    });
  }

  protected download(file: ChatDownload): void {
    downloadCsv(file);
  }

  /** Post buttons open the post, or — under a "Which post?" reply — summarize it. */
  protected clickPost(post: ChatPostLink, message: ChatMessage): void {
    if (message.postsAction !== 'summarize') {
      this.postView.open(String(post.id));
      return;
    }
    this.awaiting = undefined; // answered by clicking
    this.add({ from: 'user', text: `Summarize "${post.title}"` });
    this.sending.set(true);
    // Same endpoint as the "Summarize with AI" button: POST /feed/posts/:id/summary
    // (saved summary, or Gemini, or our own summarizer when Gemini is busy).
    this.posts.summarize(String(post.id)).subscribe({
      next: ({ summary }) => {
        this.sending.set(false);
        this.add({
          from: 'bot',
          text: `Summary of "${post.title}":\n\n${summary}`,
          posts: [post],
          postsAction: 'open',
        });
      },
      error: () => {
        this.sending.set(false);
        this.add({
          from: 'bot',
          text: "Sorry, I couldn't summarize that post. Please try again.",
          failed: true,
        });
      },
    });
  }

  protected runAction(action: ChatAction): void {
    if (action.type !== 'open_editor') return;
    this.open.set(false);
    if (action.postId != null) {
      void this.router.navigate(['/posts', String(action.postId)]);
      return;
    }
    void this.router.navigate(['/posts/new'], {
      queryParams: action.topic ? { topic: action.topic } : {},
    });
  }

  // ---- post drafts written in the chat (chat-draft-card) ----------------------------

  /** Saved with POST /feed/posts → always a draft; the creator submits it for review later. */
  protected onDraftSaved(post: Post): void {
    this.add({
      from: 'bot',
      text: `Saved as a draft: "${post.title}". Open it in the editor to check it and submit it for review.`,
      action: { type: 'open_editor', postId: post.id },
    });
  }

  /** Continue in the editor: title and content travel in the navigation state (not the URL). */
  protected editDraft(draft: ChatDraft): void {
    this.open.set(false);
    void this.router.navigate(['/posts/new'], {
      state: { draft: { title: draft.title, content: draft.content } },
    });
  }

  /** Another version: answer the tone question again with the same topic and tone. */
  protected retryDraft(draft: ChatDraft): void {
    if (!draft.topic) return;
    this.awaiting = 'post_tone';
    this.pendingDraft = { topic: draft.topic };
    this.submit(draft.tone ?? 'informative', 'Try another version');
  }

  private add(message: Omit<ChatMessage, 'id'>): void {
    this.messages.update((list) => [...list, { ...message, id: this.nextId++ }]);
  }
}

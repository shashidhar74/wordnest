import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { Subject, debounceTime, distinctUntilChanged, filter, switchMap } from 'rxjs';
import { Post, PostStatus } from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Avatar } from '../../../shared/components/avatar/avatar';
import { ConfirmService } from '../../../shared/components/confirm-dialog/confirm-dialog';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { PageChange, Paginator } from '../../../shared/components/paginator/paginator';
import { StatusPill } from '../../../shared/components/status-pill/status-pill';
import { PostService } from '../post.service';
import { PostViewService } from '../post-view-dialog/post-view-dialog';

@Component({
  selector: 'app-post-list-page',
  imports: [RouterLink, DatePipe, NgIcon, Avatar, PageHeader, StatusPill, Paginator],
  templateUrl: './post-list-page.html',
})
export class PostListPage {
  private readonly postsApi = inject(PostService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationService);
  private readonly confirm = inject(ConfirmService);
  protected readonly postView = inject(PostViewService);

  /** `?status=` and `?search=` query params (router input binding). */
  readonly status = input<PostStatus>();
  readonly search = input<string>();

  protected readonly filters: { label: string; value?: PostStatus }[] = [
    { label: 'All' },
    { label: 'Drafts', value: 'draft' },
    { label: 'Pending', value: 'pending' },
    { label: 'Clarification', value: 'clarification' },
    { label: 'Published', value: 'published' },
    { label: 'Rejected', value: 'rejected' },
    { label: 'Closed', value: 'closed' },
  ];

  private readonly auth = inject(AuthService);
  protected readonly isCreator = computed(() => this.auth.role() === 'creator');
  protected readonly isAdmin = computed(() => this.auth.role() === 'admin');

  protected readonly rows = signal<Post[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly limit = signal(10);
  protected readonly loading = signal(true);
  protected readonly searchText = signal('');

  private readonly searchInput = new Subject<string>();

  constructor() {
    effect(() => {
      this.status();
      const search = this.search() ?? '';
      untracked(() => {
        this.searchText.set(search);
        this.page.set(1);
        this.load();
      });
    });

    this.searchInput
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((term) => this.setQuery({ search: term || null }));
  }

  protected setStatus(value?: PostStatus): void {
    this.setQuery({ status: value ?? null });
  }

  protected onSearch(value: string): void {
    this.searchText.set(value);
    this.searchInput.next(value.trim());
  }

  protected onPage({ page, limit }: PageChange): void {
    this.page.set(page);
    this.limit.set(limit);
    this.load();
  }

  protected remove(post: Post): void {
    this.confirm
      .ask({
        title: 'Delete post',
        message: `Delete “${post.title}”? This cannot be undone.`,
        confirmText: 'Delete',
        danger: true,
      })
      .pipe(
        filter(Boolean),
        switchMap(() => this.postsApi.remove(post.id)),
      )
      .subscribe(() => {
        this.notify.success('Post deleted');
        this.load();
      });
  }

  private setQuery(params: Record<string, string | null>): void {
    void this.router.navigate([], { queryParams: params, queryParamsHandling: 'merge' });
  }

  private load(): void {
    this.loading.set(true);
    this.postsApi
      .list({
        status: this.status(),
        search: this.search() ?? '',
        page: this.page(),
        limit: this.limit(),
      })
      .subscribe({
        next: (res) => {
          this.rows.set(res.data);
          this.total.set(res.total);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }
}

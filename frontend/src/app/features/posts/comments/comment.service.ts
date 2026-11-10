import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_ENDPOINTS } from '../../../core/config/api.config';
import { AddCommentDto, CommentListResponse } from '../../../core/models';
import { ApiService } from '../../../core/services/api.service';

/** REST calls for comments. Errors are shown by the error interceptor. */
@Injectable({ providedIn: 'root' })
export class CommentService {
  private readonly api = inject(ApiService);

  /** GET — the thread of a post (404 if you may not see the post). */
  list(postId: string): Observable<CommentListResponse> {
    return this.api.get<CommentListResponse>(API_ENDPOINTS.comments.forPost(postId));
  }

  /** POST — a new comment, or a reply when `parentId` is set. Published posts only. */
  add(postId: string, dto: AddCommentDto): Observable<unknown> {
    return this.api.post(API_ENDPOINTS.comments.forPost(postId), dto);
  }

  /** PATCH — edit your own comment. */
  edit(commentId: number, content: string): Observable<unknown> {
    return this.api.patch(API_ENDPOINTS.comments.byId(commentId), { content });
  }

  /** DELETE — your own comment, or any as admin. With replies it becomes "[deleted]". */
  remove(commentId: number): Observable<unknown> {
    return this.api.delete(API_ENDPOINTS.comments.byId(commentId));
  }
}

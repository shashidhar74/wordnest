import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_ENDPOINTS } from '../../core/config/api.config';
import { SILENT_ERRORS } from '../../core/interceptors/error.interceptor';
import { ChatAwaiting, ChatDraft, ChatRequest, ChatResponse } from '../../core/models';
import { ApiService } from '../../core/services/api.service';

/** Don't ask the backend to wake the AI service more often than this. */
const WARM_EVERY_MS = 5 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly api = inject(ApiService);
  private lastWarm = 0;

  /**
   * POST /chat — one message in, one bot reply out. Stateless, except the context: if the last reply
   * asked a question ("Which post?", "Which tone?"), pass back `awaiting` (and the post flow's `draft`)
   * so the backend reads this message as the answer.
   */
  send(
    message: string,
    awaiting?: ChatAwaiting,
    draft?: ChatDraft,
    silent = false,
  ): Observable<ChatResponse> {
    const body: ChatRequest = { message };
    if (awaiting) {
      body.context = { awaiting };
      // only topic/tone travel back; title/content stay in the browser
      if (draft?.topic)
        body.context.draft = { topic: draft.topic, ...(draft.tone ? { tone: draft.tone } : {}) };
    }
    // silent: no error toast (the chat panel shows its own message, e.g. "waking up")
    const context = silent ? new HttpContext().set(SILENT_ERRORS, true) : undefined;
    return this.api.post<ChatResponse>(API_ENDPOINTS.chat, body, { context });
  }

  /**
   * POST /chat/warm — wake the AI service in the background. On Render's free plan it sleeps when
   * unused and needs ~50 s to start; calling this when the app opens means it's usually awake by the
   * time the first chat message is sent. Fire-and-forget, never shows an error, at most every 5 min.
   */
  warm(force = false): void {
    const now = Date.now();
    if (!force && now - this.lastWarm < WARM_EVERY_MS) return;
    this.lastWarm = now;
    this.api
      .post(
        `${API_ENDPOINTS.chat}/warm`,
        {},
        { context: new HttpContext().set(SILENT_ERRORS, true) },
      )
      .subscribe({ error: () => (this.lastWarm = 0) }); // failed: allow another try soon
  }
}

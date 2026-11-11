import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_ENDPOINTS } from '../../core/config/api.config';
import { ChatAwaiting, ChatDraft, ChatRequest, ChatResponse } from '../../core/models';
import { ApiService } from '../../core/services/api.service';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly api = inject(ApiService);

  /**
   * POST /chat — one message in, one bot reply out. Stateless, except the context: if the last reply
   * asked a question ("Which post?", "Which tone?"), pass back `awaiting` (and the post flow's `draft`)
   * so the backend reads this message as the answer.
   */
  send(message: string, awaiting?: ChatAwaiting, draft?: ChatDraft): Observable<ChatResponse> {
    const body: ChatRequest = { message };
    if (awaiting) {
      body.context = { awaiting };
      // only topic/tone travel back; title/content stay in the browser
      if (draft?.topic)
        body.context.draft = { topic: draft.topic, ...(draft.tone ? { tone: draft.tone } : {}) };
    }
    return this.api.post<ChatResponse>(API_ENDPOINTS.chat, body);
  }
}

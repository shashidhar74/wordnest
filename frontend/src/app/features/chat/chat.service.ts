import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_ENDPOINTS } from '../../core/config/api.config';
import { ChatAwaiting, ChatRequest, ChatResponse } from '../../core/models';
import { ApiService } from '../../core/services/api.service';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly api = inject(ApiService);

  /**
   * POST /chat — one message in, one bot reply out. Stateless, except `awaiting`: if the last reply
   * asked a question ("Which post?"), pass it back so the backend reads this message as the answer.
   */
  send(message: string, awaiting?: ChatAwaiting): Observable<ChatResponse> {
    const body: ChatRequest = awaiting ? { message, context: { awaiting } } : { message };
    return this.api.post<ChatResponse>(API_ENDPOINTS.chat, body);
  }
}

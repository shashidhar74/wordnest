import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  TitleStrategy,
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
} from '@angular/router';
import { provideIcons, provideNgIconsConfig } from '@ng-icons/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { loadingInterceptor } from './core/interceptors/loading.interceptor';
import { mockApiInterceptor } from './core/mocks/mock-api.interceptor';
import { AppTitleStrategy } from './core/services/app-title.strategy';
import { AuthService } from './core/services/auth.service';
import { APP_ICONS } from './shared/icons';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
    ),
    // Tab titles: "Posts · WordNest"
    { provide: TitleStrategy, useClass: AppTitleStrategy },
    // Order matters: loading wraps everything, auth adds the header, error handles the response.
    // The mock backend sits last so its responses still flow through the error interceptor.
    provideHttpClient(
      withFetch(),
      withInterceptors([
        loadingInterceptor,
        authInterceptor,
        errorInterceptor,
        ...(environment.mock.auth || environment.mock.posts || environment.mock.chat
          ? [mockApiInterceptor]
          : []),
      ]),
    ),
    // Lucide line icons, registered once for the whole app (see shared/icons.ts).
    provideIcons(APP_ICONS),
    provideNgIconsConfig({ size: '16px', strokeWidth: 1.75 }),
    // Restore the signed-in user (GET /auth/me) before the first route renders.
    provideAppInitializer(() => firstValueFrom(inject(AuthService).loadCurrentUser())),
  ],
};

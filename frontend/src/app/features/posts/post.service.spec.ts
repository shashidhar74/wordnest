import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PostService } from './post.service';

describe('PostService workflow', () => {
  let service: PostService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PostService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const cases: [string, () => unknown, string, object][] = [
    ['submit', () => service.submit('7').subscribe(), '/api/feed/posts/7/submit', {}],
    [
      'sendBack',
      () => service.sendBack('7', 'Add more details').subscribe(),
      '/api/feed/posts/7/send-back',
      { comment: 'Add more details' },
    ],
    ['approve', () => service.approve('7').subscribe(), '/api/feed/posts/7/approve', {}],
    [
      'reject',
      () => service.reject('7', 'Not suitable').subscribe(),
      '/api/feed/posts/7/reject',
      { comment: 'Not suitable' },
    ],
    ['close', () => service.close('7').subscribe(), '/api/feed/posts/7/close', {}],
  ];

  for (const [name, call, url, body] of cases) {
    it(`${name} → PATCH ${url}`, () => {
      call();
      const req = http.expectOne(url);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual(body);
      req.flush({ message: 'ok' });
    });
  }

  it('getById reads the review comment columns', () => {
    let post: { reviewComment?: string; reviewedBy?: string; reviewedAt?: string } = {};
    service.getById('7').subscribe((p) => (post = p));
    http.expectOne('/api/feed/posts/7').flush({
      post: {
        id: 7,
        status: 'clarification',
        review_comment: 'Add more details',
        reviewed_by: 2,
        reviewed_at: '2026-10-27T10:00:00Z',
      },
    });
    expect(post.reviewComment).toBe('Add more details');
    expect(post.reviewedBy).toBe('2');
    expect(post.reviewedAt).toBe('2026-10-27T10:00:00Z');
  });

  it('create unwraps the backend reply { message, post }', () => {
    let id = '';
    service
      .create({ title: 'Hello', content: 'World', status: 'draft' }, new File(['x'], 'a.png'))
      .subscribe((p) => (id = p.id));
    http
      .expectOne('/api/feed/posts')
      .flush({ message: 'Post created', post: { id: 12, title: 'Hello', status: 'draft' } });
    expect(id).toBe('12');
  });
});

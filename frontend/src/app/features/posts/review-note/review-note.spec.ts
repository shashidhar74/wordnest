import { TestBed } from '@angular/core/testing';
import { provideIcons } from '@ng-icons/core';
import { Post, PostStatus } from '../../../core/models';
import { APP_ICONS } from '../../../shared/icons';
import { ReviewNote } from './review-note';

describe('ReviewNote', () => {
  function render(status: PostStatus, reviewComment?: string): HTMLElement {
    TestBed.configureTestingModule({ imports: [ReviewNote], providers: [provideIcons(APP_ICONS)] });
    const fixture = TestBed.createComponent(ReviewNote);
    const post: Post = {
      id: '7',
      title: 'Hello',
      content: '',
      status,
      author: { id: '1', name: 'Maya' },
      createdAt: '',
      updatedAt: '',
      reviewComment,
    };
    fixture.componentRef.setInput('post', post);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows nothing when there is no comment', () => {
    expect(render('clarification').textContent?.trim()).toBe('');
  });

  it('labels a clarification request', () => {
    const el = render('clarification', 'Add more details');
    expect(el.textContent).toContain('Changes requested by the reviewer');
    expect(el.textContent).toContain('Add more details');
  });

  it('labels a rejection reason', () => {
    expect(render('rejected', 'Not suitable').textContent).toContain('Rejected — reason');
  });

  it('marks an old comment on other statuses as the last one', () => {
    expect(render('published', 'Add more details').textContent).toContain('Last review comment');
  });
});

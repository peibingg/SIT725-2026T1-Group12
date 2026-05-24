'use strict';

const tc = require('../public/js/taskCommentsUi.js');

describe('taskCommentsUi (US-7 client helpers)', () => {
  it('mapCommentApiToRow maps id, user_id, comment, created and display fields', () => {
    const dto = {
      id: 'c1',
      user_id: 'u1',
      comment: 'Hello',
      created: '2026-05-01T12:00:00.000Z',
      user: { id: 'u1', first_name: 'Sam', last_name: 'Lee', email: 'sam@example.com' },
    };
    const row = tc.mapCommentApiToRow(dto);
    expect(row.id).toBe('c1');
    expect(row.user_id).toBe('u1');
    expect(row.comment).toBe('Hello');
    expect(row.created).toBe('2026-05-01T12:00:00.000Z');
    expect(row.authorLabel).toBe('Sam Lee');
    expect(row.createdDisplay).not.toBe('—');
    expect(row.bodyEscaped).toBe('Hello');
  });

  it('mapCommentApiToRow falls back author to user_id when user missing', () => {
    const row = tc.mapCommentApiToRow({ id: 'x', user_id: 'abc123', comment: 'x', created: null });
    expect(row.authorLabel).toBe('User abc123');
  });

  it('escapeHtml escapes markup for safe rendering if used as HTML', () => {
    expect(tc.escapeHtml('<b>x</b>')).toBe('&lt;b&gt;x&lt;/b&gt;');
  });

  it('validateCommentForSubmit rejects empty / whitespace and oversized text', () => {
    expect(tc.validateCommentForSubmit('   ').ok).toBe(false);
    expect(tc.validateCommentForSubmit('').ok).toBe(false);
    expect(tc.validateCommentForSubmit(null).ok).toBe(false);
    const long = 'a'.repeat(tc.MAX_COMMENT_LENGTH + 1);
    expect(tc.validateCommentForSubmit(long).ok).toBe(false);
    const ok = tc.validateCommentForSubmit('  ok  ');
    expect(ok.ok).toBe(true);
    expect(ok.text).toBe('ok');
  });

  it('composerStateForTask: taker + In Progress shows composer', () => {
    const task = {
      status: 'In Progress',
      owner: { id: 'o1' },
      taker: { id: 't1' },
    };
    expect(tc.composerStateForTask(task, 't1').showComposer).toBe(true);
  });

  it('composerStateForTask: owner read-only hint, no composer', () => {
    const task = { status: 'In Progress', owner: { id: 'o1' }, taker: { id: 't1' } };
    const s = tc.composerStateForTask(task, 'o1');
    expect(s.showComposer).toBe(false);
    expect(s.hint).toMatch(/assigned taker/i);
  });

  it('composerStateForTask: taker not In Progress — no composer', () => {
    const task = { status: 'Completed', owner: { id: 'o1' }, taker: { id: 't1' } };
    const s = tc.composerStateForTask(task, 't1');
    expect(s.showComposer).toBe(false);
    expect(s.hint).toMatch(/in progress/i);
  });

  it('composerStateForTask: taker + Finalised — closed, read-only', () => {
    const task = { status: 'Finalised', owner: { id: 'o1' }, taker: { id: 't1' } };
    const s = tc.composerStateForTask(task, 't1');
    expect(s.showComposer).toBe(false);
    expect(s.hint).toMatch(/closed/i);
  });
});
 
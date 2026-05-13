'use strict';

const {
  statusToDisplayLabel,
  truncateDescription,
  formatPersonName,
  DESCRIPTION_PREVIEW_MAX,
} = require('../public/js/tasksUi');

describe('tasksUi helpers', () => {
  it('maps API status to display labels (In Progress → Pending)', () => {
    expect(statusToDisplayLabel('Open')).toBe('Open');
    expect(statusToDisplayLabel('In Progress')).toBe('Pending');
    expect(statusToDisplayLabel('Completed')).toBe('Completed');
    expect(statusToDisplayLabel('Finalised')).toBe('Finalised');
  });

  it('truncateDescription returns isTruncated when text exceeds max', () => {
    const long = 'a'.repeat(DESCRIPTION_PREVIEW_MAX + 20);
    const r = truncateDescription(long, DESCRIPTION_PREVIEW_MAX);
    expect(r.isTruncated).toBe(true);
    expect(r.preview.length).toBe(DESCRIPTION_PREVIEW_MAX);
    expect(r.full).toBe(long);
  });

  it('truncateDescription does not truncate short strings', () => {
    const r = truncateDescription('short', DESCRIPTION_PREVIEW_MAX);
    expect(r.isTruncated).toBe(false);
    expect(r.preview).toBe('short');
    expect(r.full).toBe('short');
  });

  it('formatPersonName joins first and last name', () => {
    expect(formatPersonName({ first_name: 'A', last_name: 'B' })).toBe('A B');
    expect(formatPersonName(null)).toBe('—');
  });
});

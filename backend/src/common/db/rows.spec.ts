import { rowsOf } from './rows';

describe('rowsOf', () => {
  it('unwraps TypeORM UPDATE/DELETE results ([rows, rowCount])', () => {
    expect(rowsOf([[{ id: 'a' }], 1])).toEqual([{ id: 'a' }]);
    expect(rowsOf([[], 0])).toEqual([]);
  });

  it('keeps SELECT/INSERT results as they are', () => {
    expect(rowsOf([{ id: 'a' }, { id: 'b' }])).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(rowsOf([])).toEqual([]);
  });
});

import { classifyTask } from '../../../src/core/TaskRouter';

describe('classifyTask', () => {
  it.each([
    ['fix the login bug', 'fix'],
    ['fix authentication error', 'fix'],
    ['there is a crash on startup', 'fix'],
    ['add jwt authentication', 'feature'],
    ['create a new user service', 'feature'],
    ['implement pagination', 'feature'],
    ['refactor the auth module', 'refactor'],
    ['optimize database queries', 'refactor'],
    ['update documentation for the api', 'docs'],
    ['add jsdoc to all functions', 'docs'],
    ['unknown task description xyz', 'feature'], // default
  ])('classifies "%s" as "%s"', (input, expected) => {
    expect(classifyTask(input)).toBe(expected);
  });
});

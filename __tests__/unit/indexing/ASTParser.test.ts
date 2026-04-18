import { parseFiles } from '../../../src/indexing/ASTParser';
import type { ScannedFile } from '../../../src/indexing/FileScanner';

function makeFile(relPath: string, content: string): ScannedFile {
  return {
    path: `/project/${relPath}`,
    relativePath: relPath,
    content,
    size: content.length,
    extension: relPath.slice(relPath.lastIndexOf('.')),
  };
}

describe('parseFiles', () => {
  it('extracts exported functions from TypeScript', () => {
    const file = makeFile('auth.ts', `
export function login(user: string, pass: string): boolean {
  return true;
}
export const hashPassword = async (pass: string): Promise<string> => {
  return pass;
};
    `);
    const results = parseFiles([file]);
    expect(results).toHaveLength(1);
    const fns = results[0].functions.map((f) => f.name);
    expect(fns).toContain('login');
    expect(fns).toContain('hashPassword');
    expect(results[0].functions.find((f) => f.name === 'login')?.isExported).toBe(true);
  });

  it('extracts imports', () => {
    const file = makeFile('service.ts', `
import { Injectable } from '@nestjs/common';
import { UserRepository } from './user.repository';
    `);
    const results = parseFiles([file]);
    const imports = results[0].imports;
    expect(imports.some((i) => i.moduleSpecifier === '@nestjs/common')).toBe(true);
    expect(imports.some((i) => i.moduleSpecifier === './user.repository')).toBe(true);
  });

  it('extracts classes and methods', () => {
    const file = makeFile('service.ts', `
export class UserService {
  async findAll() { return []; }
  async findOne(id: string) { return null; }
}
    `);
    const results = parseFiles([file]);
    expect(results[0].classes).toHaveLength(1);
    expect(results[0].classes[0].name).toBe('UserService');
    expect(results[0].classes[0].methods).toContain('findAll');
  });

  it('falls back gracefully for non-TS files', () => {
    const file = makeFile('script.py', `
def my_function():
    pass
    `);
    const results = parseFiles([file]);
    expect(results).toHaveLength(1);
    // Should not crash, just return minimal info
    expect(results[0].relativePath).toBe('script.py');
  });

  it('handles empty files', () => {
    const file = makeFile('empty.ts', '');
    const results = parseFiles([file]);
    expect(results[0].functions).toHaveLength(0);
    expect(results[0].imports).toHaveLength(0);
  });
});

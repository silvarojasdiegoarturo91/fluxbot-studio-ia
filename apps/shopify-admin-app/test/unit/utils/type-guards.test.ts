import { describe, it, expect } from 'vitest';

describe('Type Guards and Validators', () => {
  describe('Primitive Type Guards', () => {
    it('should identify strings', () => {
      const isString = (value: unknown): value is string => 
        typeof value === 'string';

      expect(isString('test')).toBe(true);
      expect(isString(123)).toBe(false);
      expect(isString(null)).toBe(false);
      expect(isString(undefined)).toBe(false);
    });

    it('should identify numbers', () => {
      const isNumber = (value: unknown): value is number => 
        typeof value === 'number' && !isNaN(value);

      expect(isNumber(123)).toBe(true);
      expect(isNumber(0)).toBe(true);
      expect(isNumber(NaN)).toBe(false);
      expect(isNumber('123')).toBe(false);
    });

    it('should identify booleans', () => {
      const isBoolean = (value: unknown): value is boolean => 
        typeof value === 'boolean';

      expect(isBoolean(true)).toBe(true);
      expect(isBoolean(false)).toBe(true);
      expect(isBoolean(1)).toBe(false);
      expect(isBoolean('true')).toBe(false);
    });

    it('should identify null', () => {
      const isNull = (value: unknown): value is null => 
        value === null;

      expect(isNull(null)).toBe(true);
      expect(isNull(undefined)).toBe(false);
      expect(isNull(0)).toBe(false);
    });

    it('should identify undefined', () => {
      const isUndefined = (value: unknown): value is undefined => 
        value === undefined;

      expect(isUndefined(undefined)).toBe(true);
      expect(isUndefined(null)).toBe(false);
      expect(isUndefined('')).toBe(false);
    });
  });

  describe('Complex Type Guards', () => {
    it('should identify arrays', () => {
      const isArray = (value: unknown): value is any[] => 
        Array.isArray(value);

      expect(isArray([])).toBe(true);
      expect(isArray([1, 2, 3])).toBe(true);
      expect(isArray({})).toBe(false);
      expect(isArray('array')).toBe(false);
    });

    it('should identify objects', () => {
      const isObject = (value: unknown): value is Record<string, any> => 
        typeof value === 'object' && value !== null && !Array.isArray(value);

      expect(isObject({})).toBe(true);
      expect(isObject({ a: 1 })).toBe(true);
      expect(isObject([])).toBe(false);
      expect(isObject(null)).toBe(false);
    });

    it('should identify functions', () => {
      const isFunction = (value: unknown): value is Function => 
        typeof value === 'function';

      expect(isFunction(() => {})).toBe(true);
      expect(isFunction(function() {})).toBe(true);
      expect(isFunction({})).toBe(false);
    });

    it('should identify dates', () => {
      const isDate = (value: unknown): value is Date => 
        value instanceof Date && !isNaN(value.getTime());

      expect(isDate(new Date())).toBe(true);
      expect(isDate(new Date('invalid'))).toBe(false);
      expect(isDate('2024-01-01')).toBe(false);
    });

    it('should identify errors', () => {
      const isError = (value: unknown): value is Error => 
        value instanceof Error;

      expect(isError(new Error('test'))).toBe(true);
      expect(isError(new TypeError('test'))).toBe(true);
      expect(isError({ message: 'test' })).toBe(false);
    });
  });

  describe('Custom Type Guards', () => {
    interface User {
      id: string;
      name: string;
      email: string;
    }

    it('should validate user object structure', () => {
      const isUser = (value: unknown): value is User => {
        if (typeof value !== 'object' || value === null) return false;
        const obj = value as any;
        return (
          typeof obj.id === 'string' &&
          typeof obj.name === 'string' &&
          typeof obj.email === 'string'
        );
      };

      expect(isUser({ id: '1', name: 'Test', email: 'test@example.com' })).toBe(true);
      expect(isUser({ id: '1', name: 'Test' })).toBe(false);
      expect(isUser(null)).toBe(false);
    });

    interface Product {
      id: string;
      title: string;
      price: number;
      inStock: boolean;
    }

    it('should validate product object structure', () => {
      const isProduct = (value: unknown): value is Product => {
        if (typeof value !== 'object' || value === null) return false;
        const obj = value as any;
        return (
          typeof obj.id === 'string' &&
          typeof obj.title === 'string' &&
          typeof obj.price === 'number' &&
          typeof obj.inStock === 'boolean'
        );
      };

      expect(isProduct({
        id: '123',
        title: 'Product',
        price: 29.99,
        inStock: true
      })).toBe(true);

      expect(isProduct({
        id: '123',
        title: 'Product',
        price: '29.99',
        inStock: true
      })).toBe(false);
    });

    interface Message {
      role: 'user' | 'assistant' | 'system';
      content: string;
      timestamp: Date;
    }

    it('should validate message object structure', () => {
      const isMessage = (value: unknown): value is Message => {
        if (typeof value !== 'object' || value === null) return false;
        const obj = value as any;
        return (
          ['user', 'assistant', 'system'].includes(obj.role) &&
          typeof obj.content === 'string' &&
          obj.timestamp instanceof Date
        );
      };

      expect(isMessage({
        role: 'user',
        content: 'Hello',
        timestamp: new Date()
      })).toBe(true);

      expect(isMessage({
        role: 'invalid',
        content: 'Hello',
        timestamp: new Date()
      })).toBe(false);
    });
  });

  describe('Union Type Guards', () => {
    type StringOrNumber = string | number;

    it('should identify string or number', () => {
      const isStringOrNumber = (value: unknown): value is StringOrNumber => 
        typeof value === 'string' || typeof value === 'number';

      expect(isStringOrNumber('test')).toBe(true);
      expect(isStringOrNumber(123)).toBe(true);
      expect(isStringOrNumber(true)).toBe(false);
    });

    type Status = 'pending' | 'success' | 'error';

    it('should validate status enum', () => {
      const isStatus = (value: unknown): value is Status => 
        typeof value === 'string' && ['pending', 'success', 'error'].includes(value);

      expect(isStatus('pending')).toBe(true);
      expect(isStatus('success')).toBe(true);
      expect(isStatus('invalid')).toBe(false);
    });

    type Result<T> = { success: true; data: T } | { success: false; error: string };

    it('should validate result type', () => {
      const isSuccessResult = <T>(value: Result<T>): value is { success: true; data: T } => 
        value.success === true;

      const isErrorResult = <T>(value: Result<T>): value is { success: false; error: string } => 
        value.success === false;

      const success: Result<string> = { success: true, data: 'test' };
      const error: Result<string> = { success: false, error: 'failed' };

      expect(isSuccessResult(success)).toBe(true);
      expect(isSuccessResult(error)).toBe(false);
      expect(isErrorResult(error)).toBe(true);
      expect(isErrorResult(success)).toBe(false);
    });
  });

  describe('Array Type Guards', () => {
    it('should validate array of strings', () => {
      const isStringArray = (value: unknown): value is string[] => 
        Array.isArray(value) && value.every(item => typeof item === 'string');

      expect(isStringArray(['a', 'b', 'c'])).toBe(true);
      expect(isStringArray(['a', 1, 'c'])).toBe(false);
      expect(isStringArray([])).toBe(true);
    });

    it('should validate array of numbers', () => {
      const isNumberArray = (value: unknown): value is number[] => 
        Array.isArray(value) && value.every(item => typeof item === 'number');

      expect(isNumberArray([1, 2, 3])).toBe(true);
      expect(isNumberArray([1, '2', 3])).toBe(false);
    });

    it('should validate array of objects', () => {
      interface Item {
        id: string;
        value: number;
      }

      const isItemArray = (value: unknown): value is Item[] => {
        if (!Array.isArray(value)) return false;
        return value.every(item => 
          typeof item === 'object' &&
          item !== null &&
          typeof item.id === 'string' &&
          typeof item.value === 'number'
        );
      };

      expect(isItemArray([{ id: '1', value: 10 }])).toBe(true);
      expect(isItemArray([{ id: 1, value: 10 }])).toBe(false);
    });
  });

  describe('Nullable Type Guards', () => {
    it('should identify non-null values', () => {
      const isNonNull = <T>(value: T | null | undefined): value is T => 
        value !== null && value !== undefined;

      expect(isNonNull('test')).toBe(true);
      expect(isNonNull(0)).toBe(true);
      expect(isNonNull(null)).toBe(false);
      expect(isNonNull(undefined)).toBe(false);
    });

    it('should filter null and undefined from arrays', () => {
      const filterNullish = <T>(arr: (T | null | undefined)[]): T[] => 
        arr.filter((item): item is T => item !== null && item !== undefined);

      expect(filterNullish([1, null, 2, undefined, 3])).toEqual([1, 2, 3]);
      expect(filterNullish(['a', null, 'b'])).toEqual(['a', 'b']);
    });
  });

  describe('Literal Type Guards', () => {
    it('should validate string literals', () => {
      type Color = 'red' | 'green' | 'blue';

      const isColor = (value: unknown): value is Color => 
        typeof value === 'string' && ['red', 'green', 'blue'].includes(value);

      expect(isColor('red')).toBe(true);
      expect(isColor('yellow')).toBe(false);
    });

    it('should validate number literals', () => {
      type ValidId = 1 | 2 | 3;

      const isValidId = (value: unknown): value is ValidId => 
        typeof value === 'number' && [1, 2, 3].includes(value);

      expect(isValidId(1)).toBe(true);
      expect(isValidId(4)).toBe(false);
    });
  });

  describe('Generic Type Guards', () => {
    it('should create generic array validator', () => {
      function isArrayOf<T>(
        value: unknown,
        itemGuard: (item: unknown) => item is T
      ): value is T[] {
        return Array.isArray(value) && value.every(itemGuard);
      }

      const isString = (value: unknown): value is string => typeof value === 'string';
      const isNumber = (value: unknown): value is number => typeof value === 'number';

      expect(isArrayOf(['a', 'b'], isString)).toBe(true);
      expect(isArrayOf([1, 2], isNumber)).toBe(true);
      expect(isArrayOf([1, 'a'], isNumber)).toBe(false);
    });

    it('should create generic object validator', () => {
      function hasProperty<K extends string>(
        value: unknown,
        key: K
      ): value is Record<K, unknown> {
        return typeof value === 'object' && value !== null && key in value;
      }

      expect(hasProperty({ name: 'test' }, 'name')).toBe(true);
      expect(hasProperty({}, 'name')).toBe(false);
    });
  });
});

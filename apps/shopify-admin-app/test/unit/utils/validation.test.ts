import { describe, it, expect } from 'vitest';

describe('Data Validation Utilities', () => {
  describe('String Validation', () => {
    it('should validate non-empty strings', () => {
      const validateNonEmpty = (str: string) => str.trim().length > 0;

      expect(validateNonEmpty('test')).toBe(true);
      expect(validateNonEmpty('  test  ')).toBe(true);
      expect(validateNonEmpty('')).toBe(false);
      expect(validateNonEmpty('   ')).toBe(false);
    });

    it('should validate string length', () => {
      const validateLength = (str: string, min: number, max: number) => 
        str.length >= min && str.length <= max;

      expect(validateLength('test', 1, 10)).toBe(true);
      expect(validateLength('test', 5, 10)).toBe(false);
      expect(validateLength('test', 1, 3)).toBe(false);
    });

    it('should validate email format', () => {
      const validateEmail = (email: string) => 
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

      expect(validateEmail('test@example.com')).toBe(true);
      expect(validateEmail('user+tag@domain.co.uk')).toBe(true);
      expect(validateEmail('invalid.email')).toBe(false);
      expect(validateEmail('@example.com')).toBe(false);
    });

    it('should validate URL format', () => {
      const validateUrl = (url: string) => {
        try {
          new URL(url);
          return true;
        } catch {
          return false;
        }
      };

      expect(validateUrl('https://example.com')).toBe(true);
      expect(validateUrl('http://localhost:3000')).toBe(true);
      expect(validateUrl('invalid-url')).toBe(false);
    });

    it('should sanitize HTML content', () => {
      const sanitizeHtml = (str: string) => 
        str.replace(/<[^>]*>/g, '');

      expect(sanitizeHtml('<p>Hello</p>')).toBe('Hello');
      expect(sanitizeHtml('<script>alert("xss")</script>')).toBe('alert("xss")');
      expect(sanitizeHtml('No tags here')).toBe('No tags here');
    });

    it('should truncate long strings', () => {
      const truncate = (str: string, length: number) => 
        str.length > length ? str.substring(0, length) + '...' : str;

      expect(truncate('Short', 10)).toBe('Short');
      expect(truncate('This is a very long string', 10)).toBe('This is a ...');
    });
  });

  describe('Number Validation', () => {
    it('should validate positive numbers', () => {
      const isPositive = (num: number) => num > 0;

      expect(isPositive(5)).toBe(true);
      expect(isPositive(0)).toBe(false);
      expect(isPositive(-5)).toBe(false);
    });

    it('should validate number range', () => {
      const inRange = (num: number, min: number, max: number) => 
        num >= min && num <= max;

      expect(inRange(5, 1, 10)).toBe(true);
      expect(inRange(0, 1, 10)).toBe(false);
      expect(inRange(11, 1, 10)).toBe(false);
    });

    it('should validate integer values', () => {
      const isInteger = (num: number) => Number.isInteger(num);

      expect(isInteger(5)).toBe(true);
      expect(isInteger(5.5)).toBe(false);
      expect(isInteger(0)).toBe(true);
    });

    it('should parse safe integers', () => {
      const parseSafeInt = (str: string, defaultValue: number = 0) => {
        const num = parseInt(str, 10);
        return isNaN(num) ? defaultValue : num;
      };

      expect(parseSafeInt('123')).toBe(123);
      expect(parseSafeInt('invalid')).toBe(0);
      expect(parseSafeInt('invalid', 10)).toBe(10);
    });

    it('should parse safe floats', () => {
      const parseSafeFloat = (str: string, defaultValue: number = 0) => {
        const num = parseFloat(str);
        return isNaN(num) ? defaultValue : num;
      };

      expect(parseSafeFloat('123.45')).toBe(123.45);
      expect(parseSafeFloat('invalid')).toBe(0);
      expect(parseSafeFloat('invalid', 5.5)).toBe(5.5);
    });
  });

  describe('Array Validation', () => {
    it('should validate non-empty arrays', () => {
      const isNonEmpty = (arr: any[]) => Array.isArray(arr) && arr.length > 0;

      expect(isNonEmpty([1, 2, 3])).toBe(true);
      expect(isNonEmpty([])).toBe(false);
      expect(isNonEmpty([undefined])).toBe(true);
    });

    it('should validate array of specific type', () => {
      const allStrings = (arr: any[]) => 
        arr.every(item => typeof item === 'string');

      expect(allStrings(['a', 'b', 'c'])).toBe(true);
      expect(allStrings(['a', 1, 'c'])).toBe(false);
      expect(allStrings([])).toBe(true);
    });

    it('should validate unique values', () => {
      const hasUniqueValues = (arr: any[]) => 
        new Set(arr).size === arr.length;

      expect(hasUniqueValues([1, 2, 3])).toBe(true);
      expect(hasUniqueValues([1, 2, 2])).toBe(false);
      expect(hasUniqueValues([])).toBe(true);
    });

    it('should remove duplicates', () => {
      const removeDuplicates = (arr: any[]) => [...new Set(arr)];

      expect(removeDuplicates([1, 2, 2, 3])).toEqual([1, 2, 3]);
      expect(removeDuplicates(['a', 'b', 'a'])).toEqual(['a', 'b']);
    });

    it('should chunk arrays', () => {
      const chunk = (arr: any[], size: number) => {
        const chunks = [];
        for (let i = 0; i < arr.length; i += size) {
          chunks.push(arr.slice(i, i + size));
        }
        return chunks;
      };

      expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
      expect(chunk([1, 2, 3], 5)).toEqual([[1, 2, 3]]);
    });
  });

  describe('Object Validation', () => {
    it('should validate required properties', () => {
      const hasRequiredProps = (obj: any, props: string[]) => 
        props.every(prop => obj.hasOwnProperty(prop));

      expect(hasRequiredProps({ a: 1, b: 2 }, ['a', 'b'])).toBe(true);
      expect(hasRequiredProps({ a: 1 }, ['a', 'b'])).toBe(false);
    });

    it('should validate non-empty object', () => {
      const isNonEmpty = (obj: any) => 
        typeof obj === 'object' && obj !== null && Object.keys(obj).length > 0;

      expect(isNonEmpty({ a: 1 })).toBe(true);
      expect(isNonEmpty({})).toBe(false);
      expect(isNonEmpty(null)).toBe(false);
    });

    it('should deep clone objects', () => {
      const deepClone = (obj: any) => JSON.parse(JSON.stringify(obj));

      const original = { a: 1, b: { c: 2 } };
      const cloned = deepClone(original);

      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned.b).not.toBe(original.b);
    });

    it('should merge objects', () => {
      const merge = (...objects: any[]) => Object.assign({}, ...objects);

      expect(merge({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
      expect(merge({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
    });

    it('should pick properties from object', () => {
      const pick = (obj: any, keys: string[]) => 
        keys.reduce((acc, key) => {
          if (obj.hasOwnProperty(key)) acc[key] = obj[key];
          return acc;
        }, {} as any);

      expect(pick({ a: 1, b: 2, c: 3 }, ['a', 'c'])).toEqual({ a: 1, c: 3 });
    });

    it('should omit properties from object', () => {
      const omit = (obj: any, keys: string[]) => 
        Object.keys(obj)
          .filter(key => !keys.includes(key))
          .reduce((acc, key) => {
            acc[key] = obj[key];
            return acc;
          }, {} as any);

      expect(omit({ a: 1, b: 2, c: 3 }, ['b'])).toEqual({ a: 1, c: 3 });
    });
  });

  describe('Date Validation', () => {
    it('should validate date strings', () => {
      const isValidDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return !isNaN(date.getTime());
      };

      expect(isValidDate('2024-01-01')).toBe(true);
      expect(isValidDate('invalid')).toBe(false);
    });

    it('should validate date range', () => {
      const isInRange = (date: Date, start: Date, end: Date) => 
        date >= start && date <= end;

      const now = new Date();
      const tomorrow = new Date(now.getTime() + 86400000);
      const yesterday = new Date(now.getTime() - 86400000);

      expect(isInRange(now, yesterday, tomorrow)).toBe(true);
      expect(isInRange(yesterday, now, tomorrow)).toBe(false);
    });

    it('should format dates consistently', () => {
      const formatDate = (date: Date) => date.toISOString();

      const date = new Date('2024-01-01T00:00:00Z');
      expect(formatDate(date)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('UUID Validation', () => {
    it('should validate UUID format', () => {
      const isUUID = (str: string) => 
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

      expect(isUUID('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
      expect(isUUID('invalid-uuid')).toBe(false);
      expect(isUUID('123e4567e89b12d3a456426614174000')).toBe(false);
    });

    it('should validate UUID v4 specifically', () => {
      const isUUIDv4 = (str: string) => 
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);

      expect(isUUIDv4('123e4567-e89b-42d3-a456-426614174000')).toBe(true);
      expect(isUUIDv4('123e4567-e89b-12d3-a456-426614174000')).toBe(false);
    });
  });

  describe('JSON Validation', () => {
    it('should validate JSON strings', () => {
      const isValidJSON = (str: string) => {
        try {
          JSON.parse(str);
          return true;
        } catch {
          return false;
        }
      };

      expect(isValidJSON('{"valid": true}')).toBe(true);
      expect(isValidJSON('{invalid}')).toBe(false);
    });

    it('should safely parse JSON with default', () => {
      const safeJSONParse = (str: string, defaultValue: any = null) => {
        try {
          return JSON.parse(str);
        } catch {
          return defaultValue;
        }
      };

      expect(safeJSONParse('{"a": 1}')).toEqual({ a: 1 });
      expect(safeJSONParse('invalid')).toBeNull();
      expect(safeJSONParse('invalid', {})).toEqual({});
    });
  });
});

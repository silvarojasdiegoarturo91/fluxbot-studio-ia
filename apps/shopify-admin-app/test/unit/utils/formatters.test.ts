import { describe, it, expect } from 'vitest';

describe('Data Formatters', () => {
  describe('Currency Formatting', () => {
    it('should format currency with proper decimals', () => {
      const formatCurrency = (amount: number, currency: string = 'USD') => {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency
        }).format(amount);
      };

      expect(formatCurrency(1234.56)).toBe('$1,234.56');
      expect(formatCurrency(0)).toBe('$0.00');
      expect(formatCurrency(999999.99)).toBe('$999,999.99');
    });

    it('should format different currencies', () => {
      const formatCurrency = (amount: number, currency: string) => {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency
        }).format(amount);
      };

      expect(formatCurrency(100, 'EUR')).toContain('€');
      expect(formatCurrency(100, 'GBP')).toContain('£');
      expect(formatCurrency(100, 'JPY')).toContain('¥');
    });

    it('should handle negative amounts', () => {
      const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD'
        }).format(amount);
      };

      expect(formatCurrency(-50)).toContain('-');
      expect(formatCurrency(-50)).toContain('50');
    });
  });

  describe('Number Formatting', () => {
    it('should format large numbers with commas', () => {
      const formatNumber = (num: number) => {
        return new Intl.NumberFormat('en-US').format(num);
      };

      expect(formatNumber(1000)).toBe('1,000');
      expect(formatNumber(1000000)).toBe('1,000,000');
      expect(formatNumber(123456789)).toBe('123,456,789');
    });

    it('should format percentages', () => {
      const formatPercentage = (num: number, decimals: number = 2) => {
        return `${num.toFixed(decimals)}%`;
      };

      expect(formatPercentage(45.678)).toBe('45.68%');
      expect(formatPercentage(100)).toBe('100.00%');
      expect(formatPercentage(0.5, 1)).toBe('0.5%');
    });

    it('should format file sizes', () => {
      const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
      };

      expect(formatBytes(0)).toBe('0 Bytes');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1048576)).toBe('1 MB');
      expect(formatBytes(1073741824)).toBe('1 GB');
    });

    it('should abbreviate large numbers', () => {
      const abbreviateNumber = (num: number) => {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
      };

      expect(abbreviateNumber(500)).toBe('500');
      expect(abbreviateNumber(1500)).toBe('1.5K');
      expect(abbreviateNumber(1500000)).toBe('1.5M');
    });
  });

  describe('Date Formatting', () => {
    it('should format dates in different styles', () => {
      const formatDate = (date: Date, style: 'short' | 'long' = 'short') => {
        if (style === 'short') {
          return date.toLocaleDateString('en-US');
        }
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      };

      const testDate = new Date('2024-03-15');
      expect(formatDate(testDate, 'short')).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
      expect(formatDate(testDate, 'long')).toContain('2024');
    });

    it('should format time', () => {
      const formatTime = (date: Date) => {
        return date.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit'
        });
      };

      const testDate = new Date('2024-03-15T14:30:00');
      expect(formatTime(testDate)).toMatch(/\d{1,2}:\d{2}/);
    });

    it('should format relative time', () => {
      const formatRelativeTime = (date: Date) => {
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
        if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        return 'just now';
      };

      const now = new Date();
      expect(formatRelativeTime(now)).toBe('just now');

      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      expect(formatRelativeTime(fiveMinutesAgo)).toContain('minute');
    });

    it('should calculate time difference', () => {
      const timeDiff = (start: Date, end: Date) => {
        return Math.abs(end.getTime() - start.getTime());
      };

      const date1 = new Date('2024-01-01');
      const date2 = new Date('2024-01-02');
      expect(timeDiff(date1, date2)).toBe(86400000); // 1 day in ms
    });
  });

  describe('String Formatting', () => {
    it('should capitalize first letter', () => {
      const capitalize = (str: string) => 
        str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();

      expect(capitalize('hello')).toBe('Hello');
      expect(capitalize('WORLD')).toBe('World');
      expect(capitalize('test123')).toBe('Test123');
    });

    it('should convert to title case', () => {
      const toTitleCase = (str: string) => 
        str.split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ');

      expect(toTitleCase('hello world')).toBe('Hello World');
      expect(toTitleCase('the quick brown fox')).toBe('The Quick Brown Fox');
    });

    it('should convert camelCase to kebab-case', () => {
      const camelToKebab = (str: string) => 
        str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

      expect(camelToKebab('camelCase')).toBe('camel-case');
      expect(camelToKebab('thisIsTest')).toBe('this-is-test');
      expect(camelToKebab('myTestString')).toBe('my-test-string');
    });

    it('should convert snake_case to camelCase', () => {
      const snakeToCamel = (str: string) => 
        str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());

      expect(snakeToCamel('snake_case')).toBe('snakeCase');
      expect(snakeToCamel('this_is_a_test')).toBe('thisIsATest');
    });

    it('should slugify strings', () => {
      const slugify = (str: string) => 
        str.toLowerCase()
          .trim()
          .replace(/[^\w\s-]/g, '')
          .replace(/[\s_-]+/g, '-')
          .replace(/^-+|-+$/g, '');

      expect(slugify('Hello World!')).toBe('hello-world');
      expect(slugify('Test   with   spaces')).toBe('test-with-spaces');
      expect(slugify('Special @#$ chars')).toBe('special-chars');
    });

    it('should pluralize words', () => {
      const pluralize = (word: string, count: number) => 
        count === 1 ? word : word + 's';

      expect(pluralize('item', 1)).toBe('item');
      expect(pluralize('item', 5)).toBe('items');
      expect(pluralize('product', 0)).toBe('products');
    });
  });

  describe('Phone Number Formatting', () => {
    it('should format US phone numbers', () => {
      const formatPhone = (phone: string) => {
        const cleaned = phone.replace(/\D/g, '');
        if (cleaned.length === 10) {
          return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
        }
        return phone;
      };

      expect(formatPhone('1234567890')).toBe('(123) 456-7890');
      expect(formatPhone('123-456-7890')).toBe('(123) 456-7890');
    });

    it('should validate phone number length', () => {
      const isValidPhone = (phone: string) => {
        const cleaned = phone.replace(/\D/g, '');
        return cleaned.length === 10 || cleaned.length === 11;
      };

      expect(isValidPhone('1234567890')).toBe(true);
      expect(isValidPhone('123456789')).toBe(false);
    });
  });

  describe('Address Formatting', () => {
    it('should format full address', () => {
      const formatAddress = (address: {
        street: string;
        city: string;
        state: string;
        zip: string;
      }) => {
        return `${address.street}, ${address.city}, ${address.state} ${address.zip}`;
      };

      expect(formatAddress({
        street: '123 Main St',
        city: 'New York',
        state: 'NY',
        zip: '10001'
      })).toBe('123 Main St, New York, NY 10001');
    });

    it('should validate zip code format', () => {
      const isValidZip = (zip: string) => /^\d{5}(-\d{4})?$/.test(zip);

      expect(isValidZip('12345')).toBe(true);
      expect(isValidZip('12345-6789')).toBe(true);
      expect(isValidZip('1234')).toBe(false);
    });
  });

  describe('Array Formatting', () => {
    it('should format array as comma-separated list', () => {
      const formatList = (items: string[]) => items.join(', ');

      expect(formatList(['a', 'b', 'c'])).toBe('a, b, c');
      expect(formatList(['one'])).toBe('one');
    });

    it('should format array with "and" for last item', () => {
      const formatListWithAnd = (items: string[]) => {
        if (items.length === 0) return '';
        if (items.length === 1) return items[0];
        if (items.length === 2) return items.join(' and ');
        return items.slice(0, -1).join(', ') + ', and ' + items[items.length - 1];
      };

      expect(formatListWithAnd(['a'])).toBe('a');
      expect(formatListWithAnd(['a', 'b'])).toBe('a and b');
      expect(formatListWithAnd(['a', 'b', 'c'])).toBe('a, b, and c');
    });
  });

  describe('Template Strings', () => {
    it('should replace placeholders in templates', () => {
      const fillTemplate = (template: string, data: Record<string, any>) => {
        return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] || '');
      };

      expect(fillTemplate('Hello {{name}}!', { name: 'World' })).toBe('Hello World!');
      expect(fillTemplate('{{greeting}} {{name}}', { greeting: 'Hi', name: 'User' }))
        .toBe('Hi User');
    });

    it('should handle missing template variables', () => {
      const fillTemplate = (template: string, data: Record<string, any>) => {
        return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] || '');
      };

      expect(fillTemplate('Hello {{name}}!', {})).toBe('Hello !');
      expect(fillTemplate('{{a}} {{b}}', { a: 'A' })).toBe('A ');
    });
  });
});

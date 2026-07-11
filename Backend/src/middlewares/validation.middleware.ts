import mongoSanitize from 'express-mongo-sanitize';
import { checkSchema, validationResult, type Schema } from 'express-validator';
import xss from 'xss';
import { HttpError } from '../errors/http-error.js';

interface ValidationRequest {
  body?: Record<string, unknown>;
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
}

const xssOptions = {
  whiteList: {},
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script', 'style']
};

function cleanString(value: string): string {
  return xss(value.trim(), xssOptions);
}

function cleanPayload<T>(value: T): T {
  if (typeof value === 'string') {
    return cleanString(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map(cleanPayload) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [key, cleanPayload(nestedValue)])
    ) as T;
  }

  return value;
}

function assertNoSqlSafe(value: Record<string, unknown> | undefined, field: string): void {
  if (value && mongoSanitize.has(value)) {
    throw new HttpError(400, 'Validation failed', {}, [
      { field, message: 'Invalid input keys are not allowed.' }
    ]);
  }
}

export async function validateRequest<T>(
  payload: ValidationRequest,
  schema: Schema,
  target: 'body' | 'params' | 'query' = 'body'
): Promise<T> {
  const request: ValidationRequest = {
    body: payload.body ? cleanPayload(mongoSanitize.sanitize({ ...payload.body })) : {},
    params: payload.params ? cleanPayload(mongoSanitize.sanitize({ ...payload.params })) : {},
    query: payload.query ? cleanPayload(mongoSanitize.sanitize({ ...payload.query })) : {}
  };

  assertNoSqlSafe(payload.body, 'body');
  assertNoSqlSafe(payload.params, 'params');
  assertNoSqlSafe(payload.query, 'query');

  await Promise.all(checkSchema(schema).map((validation) => validation.run(request)));

  const result = validationResult(request);
  if (!result.isEmpty()) {
    throw new HttpError(
      400,
      'Validation failed',
      {},
      result.array({ onlyFirstError: true }).map((error) => ({
        field: error.type === 'field' ? error.path : 'request',
        message: error.msg
      }))
    );
  }

  return request[target] as T;
}

export const loginValidationSchema: Schema = {
  email: {
    in: ['body'],
    trim: true,
    normalizeEmail: true,
    isEmail: { errorMessage: 'Enter a valid email address.' }
  },
  password: {
    in: ['body'],
    isString: { errorMessage: 'Password is required.' },
    isLength: {
      options: { min: 1, max: 200 },
      errorMessage: 'Password is required.'
    }
  }
};

export const registerValidationSchema: Schema = {
  name: {
    in: ['body'],
    trim: true,
    isLength: {
      options: { min: 2, max: 80 },
      errorMessage: 'Name must be between 2 and 80 characters.'
    },
    matches: {
      options: /^[A-Za-z\s'.-]+$/,
      errorMessage: 'Name can only contain letters, spaces, apostrophes, dots, and hyphens.'
    }
  },
  studentId: {
    in: ['body'],
    optional: { options: { nullable: true, checkFalsy: true } },
    trim: true,
    isLength: {
      options: { max: 30 },
      errorMessage: 'Student ID must be 30 characters or fewer.'
    },
    matches: {
      options: /^[A-Za-z0-9-]+$/,
      errorMessage: 'Student ID can only contain letters, numbers, and hyphens.'
    }
  },
  email: {
    in: ['body'],
    trim: true,
    normalizeEmail: true,
    isEmail: { errorMessage: 'Enter a valid email address.' },
    isLength: {
      options: { max: 120 },
      errorMessage: 'Email must be 120 characters or fewer.'
    }
  },
  password: {
    in: ['body'],
    isString: { errorMessage: 'Password is required.' },
    isLength: {
      options: { min: 8, max: 20 },
      errorMessage: 'Password must be between 8 and 20 characters.'
    }
  },
  phone: {
    in: ['body'],
    trim: true,
    matches: {
      options: /^\+?[0-9\s-]{7,20}$/,
      errorMessage: 'Enter a valid phone number.'
    }
  },
  role: {
    in: ['body'],
    isIn: {
      options: [['Student', 'Maintenance Staff', 'Administrator']],
      errorMessage: 'Enter a valid user role.'
    }
  },
  building: {
    in: ['body'],
    trim: true,
    isLength: {
      options: { min: 2, max: 80 },
      errorMessage: 'Building must be between 2 and 80 characters.'
    }
  },
  room: {
    in: ['body'],
    trim: true,
    isLength: {
      options: { min: 1, max: 20 },
      errorMessage: 'Room must be between 1 and 20 characters.'
    },
    matches: {
      options: /^[A-Za-z0-9\s-]+$/,
      errorMessage: 'Room can only contain letters, numbers, spaces, and hyphens.'
    }
  }
};

export const complaintIdValidationSchema: Schema = {
  id: {
    in: ['params'],
    trim: true,
    isLength: {
      options: { min: 2, max: 30 },
      errorMessage: 'Complaint ID must be between 2 and 30 characters.'
    },
    matches: {
      options: /^[A-Za-z0-9-]+$/,
      errorMessage: 'Complaint ID can only contain letters, numbers, and hyphens.'
    }
  }
};

export const searchValidationSchema: Schema = {
  search: {
    in: ['query'],
    optional: { options: { nullable: true, checkFalsy: true } },
    trim: true,
    isLength: {
      options: { max: 80 },
      errorMessage: 'Search text must be 80 characters or fewer.'
    }
  }
};

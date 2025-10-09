// Shared types for DevFormat.io YAML Linter & Fixer

export interface YamlValidationRequest {
  content: string;
  filename?: string;
  schema?: 'kubernetes' | 'docker-compose' | 'github-actions' | 'generic';
}

export interface YamlValidationError {
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
  type: 'syntax' | 'indentation' | 'schema' | 'type' | 'format';
  suggestion?: string;
}

export interface YamlValidationResponse {
  isValid: boolean;
  errors: YamlValidationError[];
  fixedContent?: string;
  canAutoFix: boolean;
  explanation?: string;
  suggestions: string[];
}

export interface YamlFixRequest {
  content: string;
  fixTypes: YamlFixType[];
}

export type YamlFixType = 
  | 'indentation'
  | 'quotes'
  | 'trailing-spaces'
  | 'empty-lines'
  | 'boolean-format'
  | 'duplicate-keys'
  | 'all';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface FileUploadResponse {
  filename: string;
  size: number;
  content: string;
}

// User and Auth types for future premium features
export interface User {
  id: string;
  email: string;
  plan: 'free' | 'pro' | 'team' | 'enterprise';
  usage: {
    dailyLints: number;
    monthlyLints: number;
    filesProcessed: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface UsageLimit {
  dailyLints: number;
  maxFileSize: number; // in bytes
  canAutoFix: boolean;
  canExportZip: boolean;
  apiAccess: boolean;
}

// Constants
export const PLAN_LIMITS: Record<User['plan'], UsageLimit> = {
  free: {
    dailyLints: 10,
    maxFileSize: 50 * 1024, // 50KB
    canAutoFix: false,
    canExportZip: false,
    apiAccess: false,
  },
  pro: {
    dailyLints: 500,
    maxFileSize: 1024 * 1024, // 1MB
    canAutoFix: true,
    canExportZip: true,
    apiAccess: false,
  },
  team: {
    dailyLints: 2000,
    maxFileSize: 5 * 1024 * 1024, // 5MB
    canAutoFix: true,
    canExportZip: true,
    apiAccess: true,
  },
  enterprise: {
    dailyLints: -1, // unlimited
    maxFileSize: 10 * 1024 * 1024, // 10MB
    canAutoFix: true,
    canExportZip: true,
    apiAccess: true,
  },
};
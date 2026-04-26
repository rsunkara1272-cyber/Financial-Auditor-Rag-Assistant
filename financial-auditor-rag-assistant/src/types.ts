export interface Document {
  id: string;
  name: string;
  content: string;
  type: string;
  size: number;
  isPrimary?: boolean;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  KeywordSuggestion,
  TagSuggestion,
  CompetitorVideoSample,
  ChannelSnapshot,
  RankSnapshot,
} from '@/types';

const DB_NAME = 'panna-command-center';
const DB_VERSION = 3;

interface SuggestionsCacheEntry {
  seed: string;
  fetchedAt: string;
  suggestions: KeywordSuggestion[];
}

interface CompetitorCacheEntry {
  seed: string;
  fetchedAt: string;
  tagSuggestions: TagSuggestion[];
  competitorSample: CompetitorVideoSample[];
}

/** Single shared IndexedDB schema for the whole app. Every feature that needs
 * persistent local storage adds its store here — a second independent openDB() call
 * against the same database name would race with this one over who owns the schema
 * upgrade, so this file is the one place that's allowed to call openDB. */
interface PccDB extends DBSchema {
  suggestionsCache: {
    key: string;
    value: SuggestionsCacheEntry;
  };
  competitorCache: {
    key: string;
    value: CompetitorCacheEntry;
  };
  channelSnapshots: {
    key: [string, string]; // [channelId, dateISO]
    value: ChannelSnapshot;
    indexes: { byChannel: string };
  };
  rankHistory: {
    key: [string, string]; // [keyword, dateISO]
    value: RankSnapshot;
    indexes: { byKeyword: string };
  };
}

let dbPromise: Promise<IDBPDatabase<PccDB>> | null = null;

export const getDb = () => {
  if (!dbPromise) {
    dbPromise = openDB<PccDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('suggestionsCache')) {
          db.createObjectStore('suggestionsCache', { keyPath: 'seed' });
        }
        if (!db.objectStoreNames.contains('competitorCache')) {
          db.createObjectStore('competitorCache', { keyPath: 'seed' });
        }
        if (!db.objectStoreNames.contains('channelSnapshots')) {
          const store = db.createObjectStore('channelSnapshots', { keyPath: ['channelId', 'dateISO'] });
          store.createIndex('byChannel', 'channelId');
        }
        if (!db.objectStoreNames.contains('rankHistory')) {
          const store = db.createObjectStore('rankHistory', { keyPath: ['keyword', 'dateISO'] });
          store.createIndex('byKeyword', 'keyword');
        }
      },
    });
  }
  return dbPromise;
};

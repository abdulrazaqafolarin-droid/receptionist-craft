// ═══════════════════════════════════════════════════════════════════════════
// AI CHAT SHARED MODULES - MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════
// Modular architecture for the conversational AI system
// 
// Modules:
// - safety.ts: Safety classifier & red-teaming patterns
// - context.ts: Memory & context management  
// - intent.ts: Intent recognition & message analysis
// - quality-metrics.ts: Response quality evaluation
// - micro-behavior.ts: Natural language patterns
// ═══════════════════════════════════════════════════════════════════════════

export * from './safety.ts';
export * from './context.ts';
export * from './intent.ts';
export * from './quality-metrics.ts';
export * from './micro-behavior.ts';

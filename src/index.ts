import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

import {
  HumanMessage,
  AIMessage,
  BaseMessage,
  mapChatMessagesToStoredMessages,
  mapStoredMessagesToChatMessages,
} from '@langchain/core/messages';
import { supervisor } from './agents/supervisor';
import { AGENT_NAME } from './prompts/shared';

// ─── COLORS ─────────────────────────────────────────────────────────────────────

const c = {
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

// ─── OUTPUT HELPERS ─────────────────────────────────────────────────────────────
// chat() → user-facing conversation (stdout)
// debug() → internal system logs (stderr) — won't mix with chat

function chat(message: string) {
  process.stdout.write(message + '\n');
}

function debug(message: string) {
  process.stderr.write(c.dim('[debug] ' + message) + '\n');
}

// ─── PERSISTENCE ───────────────────────────────────────────────────────────────

const SESSION_FILE = path.join(process.cwd(), '.conversation-session.json');

interface SessionData {
  messages: ReturnType<typeof mapChatMessagesToStoredMessages>;
  phase: 'gathering' | 'planning';
}

function loadSession(): {
  messages: BaseMessage[];
  phase: 'gathering' | 'planning';
} {
  try {
    if (!fs.existsSync(SESSION_FILE))
      return { messages: [], phase: 'gathering' };
    const raw = fs.readFileSync(SESSION_FILE, 'utf-8');
    const data = JSON.parse(raw);

    if (Array.isArray(data)) {
      const messages =
        data.length > 0 ? mapStoredMessagesToChatMessages(data) : [];
      return { messages, phase: 'gathering' };
    }

    const session = data as SessionData;
    const messages =
      Array.isArray(session.messages) && session.messages.length > 0
        ? mapStoredMessagesToChatMessages(session.messages)
        : [];
    return { messages, phase: session.phase || 'gathering' };
  } catch {
    try {
      fs.unlinkSync(SESSION_FILE);
    } catch {
      /* ignore */
    }
    return { messages: [], phase: 'gathering' };
  }
}

function saveSession(
  messages: BaseMessage[],
  phase: 'gathering' | 'planning',
): void {
  try {
    const data: SessionData = {
      messages: mapChatMessagesToStoredMessages(messages),
      phase,
    };
    fs.writeFileSync(SESSION_FILE, JSON.stringify(data), 'utf-8');
  } catch {
    // Silent fail — non-critical
  }
}

function clearSession(): void {
  try {
    if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE);
  } catch {
    /* ignore */
  }
}

// ─── CLI CHAT ───────────────────────────────────────────────────────────────────

async function main() {
  chat(c.cyan('─'.repeat(50)));
  chat(c.bold(c.cyan(`  ${AGENT_NAME} - Travel Planner`)));
  chat(c.cyan('─'.repeat(50)));
  chat(c.dim('  Type your message and press Enter.'));
  chat(c.dim('  Type "quit" to exit, "new" for a new trip.\n'));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(prompt, resolve));

  let { messages: conversationHistory, phase: currentPhase } = loadSession();

  if (conversationHistory.length > 0) {
    const resume = await ask(c.yellow('Resume previous conversation? (y/n): '));
    if (
      resume.trim().toLowerCase() !== 'y' &&
      resume.trim().toLowerCase() !== 'yes'
    ) {
      conversationHistory = [];
      currentPhase = 'gathering';
      clearSession();
      chat(
        `\nHey there! I'm ${AGENT_NAME}, your travel planner. Tell me about the trip you're dreaming of!\n`,
      );
    } else {
      chat(`\nResuming your conversation.\n`);
      for (let i = conversationHistory.length - 1; i >= 0; i--) {
        const msg = conversationHistory[i];
        const type =
          msg._getType?.() ?? (msg as any).constructor?.name ?? 'unknown';
        if (type === 'ai') {
          const content =
            typeof (msg as AIMessage).content === 'string'
              ? (msg as AIMessage).content
              : JSON.stringify((msg as AIMessage).content);
          const preview =
            content.length > 500 ? content.slice(0, 500) + '...' : content;
          chat(c.dim('Last message:') + '\n' + preview + '\n');
          break;
        }
      }
    }
  } else {
    chat(
      `\nHey there! I'm ${AGENT_NAME}, your travel planner. Tell me about the trip you're dreaming of!\n`,
    );
  }

  while (true) {
    const userInput = await ask(c.green('You: '));

    if (!userInput.trim()) continue;

    if (userInput.trim().toLowerCase() === 'quit') {
      chat(c.yellow('\nHappy travels! See you next time.\n'));
      rl.close();
      break;
    }

    if (userInput.trim().toLowerCase() === 'new') {
      conversationHistory = [];
      currentPhase = 'gathering';
      clearSession();
      chat(c.yellow('\nFresh start! Where are we headed?\n'));
      continue;
    }

    try {
      const userMessage = new HumanMessage(userInput);
      conversationHistory.push(userMessage);

      const stream = await supervisor.stream(
        { messages: conversationHistory, phase: currentPhase },
        { recursionLimit: 50, streamMode: 'updates' as const },
      );

      for await (const chunk of stream) {
        for (const [, update] of Object.entries(chunk)) {
          const u = update as any;

          // Track phase changes
          if (u.phase) {
            currentPhase = u.phase;
          }

          // Process messages from this node
          const msgs = u.messages || [];
          for (const msg of msgs) {
            conversationHistory.push(msg);

            // Only print AIMessages with non-empty text
            const type = msg._getType?.() ?? 'unknown';
            if (type === 'ai') {
              let text = '';
              if (typeof msg.content === 'string') {
                text = msg.content;
              } else if (Array.isArray(msg.content)) {
                // Extract only text parts, skip functionCall/toolUse parts
                text = msg.content
                  .filter((part: any) => part.type === 'text' && part.text)
                  .map((part: any) => part.text)
                  .join('');
              }
              if (text.trim()) {
                chat(`\n${c.cyan(AGENT_NAME + ':')} ${text}\n`);
              }
            }
          }
        }
      }

      saveSession(conversationHistory, currentPhase);
    } catch (error: any) {
      debug(`Error: ${error.message || error}`);
      // Remove the user message we just added since the invoke failed
      conversationHistory.pop();
    }
  }
}

main().catch((err) => {
  debug(`Startup error: ${err.message || err}`);
});

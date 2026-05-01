import 'dotenv/config';
import * as readline from 'readline';
import { SupervisorAgent } from './agents/supervisor-anthropic';
import { AGENT_NAME } from './prompts/shared';

const c = {
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Missing ANTHROPIC_API_KEY in .env');
    process.exit(1);
  }

  console.log(c.cyan('─'.repeat(50)));
  console.log(c.bold(c.cyan(`  ${AGENT_NAME} - Travel Planner (Anthropic)`)));
  console.log(c.cyan('─'.repeat(50)));
  console.log(c.dim('  Type your message. "quit" to exit.\n'));
  console.log(`Hey! I'm ${AGENT_NAME}. Tell me about the trip you're dreaming of!\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string): Promise<string> =>
    new Promise((resolve) => rl.question(q, resolve));

  const agent = new SupervisorAgent();

  while (true) {
    const userInput = (await ask(c.green('You: '))).trim();
    if (!userInput) continue;
    if (userInput.toLowerCase() === 'quit') {
      console.log(c.yellow('\nHappy travels!\n'));
      rl.close();
      break;
    }

    try {
      const reply = await agent.chat(userInput);
      if (reply.trim()) {
        console.log(`\n${c.cyan(AGENT_NAME + ':')} ${reply}\n`);
      }
    } catch (err: any) {
      console.error(c.dim(`[error] ${err.message || err}`));
    }
  }
}

main().catch((err) => console.error(`Startup error: ${err.message || err}`));

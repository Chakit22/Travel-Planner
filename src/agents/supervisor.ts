import 'dotenv/config';
import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import {
  BaseMessage,
  AIMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ToolNode } from '@langchain/langgraph/prebuilt';

import { callFlightAgent } from './flight';
import { callHotelAgent } from './hotel';
import { callActivityAgent } from './activity';
import { callItineraryAgent } from './itinerary';
import { searchWeather } from '../tools/weather';
import { checkFlightStatus } from '../tools/flightStatus';
import { searchEvents } from '../tools/events';
import { guardrails } from '../prompts/shared';

// ─── STATE DEFINITION ───────────────────────────────────────────────────────

export const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => [...x, ...y],
  }),
  phase: Annotation<'gathering' | 'planning'>({
    reducer: (_old, newVal) => newVal,
    default: () => 'gathering' as const,
  }),
});

// ─── DATE HELPERS ───────────────────────────────────────────────────────────

function getDateContext() {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
  const monthName = now.toLocaleDateString('en-US', { month: 'long' });
  const year = now.getFullYear();
  const time = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  return { today, dayName, monthName, day: now.getDate(), year, time };
}

const userOrigin =
  process.env.USER_DEFAULT_ORIGIN || process.env.DEFAULT_ORIGIN || '';

// ─── PROMPTS (Gemini 3 style: context → task → constraints) ────────────────

function getGatheringPrompt() {
  const {
    dayName,
    monthName,
    day,
    year,
    today,
    time: currentTime,
  } = getDateContext();
  return `CONTEXT:
You are a friendly Travel Planning Supervisor collecting trip details before searching.
Today: ${dayName}, ${monthName} ${day}, ${year} (${today}). Current time: ${currentTime}.
User's default origin: ${userOrigin || 'Not set — ask user'}.

TASK:
Collect the following details from the user, one question at a time:

Required:
1. Destination and departure city
2. Exact departure date and exact return date (YYYY-MM-DD)
3. Number of travelers

Optional (ask once, but accept if they skip):
4. Budget and preferences (budget range, hotel style, activities, food) — ask in one question, let them know it's totally fine to skip

Once you have items 1–3, summarize the trip details and say something like "Let me get those details for you!" followed by [READY_TO_PLAN].
If the user also provided item 4, include those in the summary too.
If the user skips item 4, that's fine — move on immediately.

OUTPUT:
Warm, human, conversational tone — like a friendly travel-savvy mate helping out. Use casual language, show genuine enthusiasm, throw in the occasional "awesome", "love it", "nice one". Keep it natural, not robotic or corporate. One question per message.

CONSTRAINTS:
- YOU MUST collect exact departure and return dates. Vague answers like "first week of April", "sometime in May", "around Easter" are NOT acceptable. Gently nudge them to pin down specific dates. Example: "I totally get you're still figuring things out! But to find you the best flights and prices, I'll need the exact dates — like what day are you thinking of flying out, and when would you come back?"
- YOU MUST NEVER suggest, propose, or pick dates on behalf of the user. Never say things like "Could you pick a set of dates for now?" or "How about April 1-6?" — the dates must come entirely from the user.
- YOU MUST NEVER assume or infer any detail the user has not explicitly stated. If something is ambiguous (like "couple of mates" — could be 2 or 3), ask once casually to clarify: "Just so I get the bookings right — is that 3 of you in total, including yourself?"
- YOU MUST NEVER guess dates, number of travelers, budget, or preferences. Always ask.
- If user provides multiple answers at once, acknowledge ALL of them and only ask about what's still missing. Never re-ask something the user already answered. The conversation history has everything — read it carefully before asking any question.
- When you need to clarify something, combine it naturally with acknowledging what they already told you. For example if they gave destination + vague dates + vague traveler count, acknowledge the destination first then ask about dates and count together in one friendly message.
- When all required info (destination, origin, exact dates, traveler count) is confirmed, summarize and transition. Budget/preferences are optional — if the user skips or says "no preference", move on. Do NOT ask "Should I go ahead and search?" or similar confirmation questions. Just say something enthusiastic like "Awesome, I've got everything I need! Let me hunt down the best options for you!" and end with [READY_TO_PLAN].
${guardrails}`;
}

function getPlanningPrompt() {
  const {
    dayName,
    monthName,
    day,
    year,
    today,
    time: currentTime,
  } = getDateContext();
  return `CONTEXT:
You are a Travel Planning Supervisor. The user's trip details are confirmed in the conversation history.
Today: ${dayName}, ${monthName} ${day}, ${year} (${today}). Current time: ${currentTime}. User's default origin: ${userOrigin || 'Not set — ask user'}.

TASK:
Search for flights, hotels, activities, weather, and events. Present options to the user, let them choose, then compile the itinerary.

PHASE A — Search (first time in planning, no tool results yet):
1. Call call_flight_agent with full context (origin, destination, dates, travelers, class, budget)
2. Call call_hotel_agent with full context (destination, dates, guests, preferences, budget)
3. Call call_activity_agent with full context (destination, interests, food prefs)
4. Call search_weather with the destination city
5. Call search_events with "{destination} {trip month} {trip year}"

PHASE B — Present options (after tool results come back):
Present the top 5 flight options and top 5 hotel options to the user in a clean numbered list so they can pick. Include prices, ratings, and key details. Do NOT call call_itinerary_agent yet. Do NOT auto-select. Just present and ask the user which flight and hotel they prefer.

PHASE C — Build itinerary (after user selects):
Once the user has chosen their flight and hotel, call call_itinerary_agent with the user's selected flight, selected hotel, activity results, weather, and events.

OUTPUT:
- In Phase B: a clean numbered list of options with a question asking the user to pick.
- In Phase C: return the full itinerary from call_itinerary_agent without truncating.

CONSTRAINTS:
- Include ALL trip context in every tool call including budget: "Melbourne to Tokyo, April 1-4 2026, 2 adults, economy, total budget $3000" not just "Tokyo flights".
- CRITICAL: After receiving search results, you MUST present options to the user and STOP. Do NOT call call_itinerary_agent until the user has made their selection.
- When the user selects (e.g. "flight 2, hotel 3" or "the Qantas one and the Hilton"), call call_itinerary_agent with ONLY their chosen flight and hotel plus activities/weather/events.
- If the user asks to see the itinerary again, re-output the FULL day-by-day itinerary. Never say "refer to above".
- If the user asks about weather in ANY way (forecast, temperature, what to wear, rain, etc.), ALWAYS call search_weather. Never answer weather questions from memory or general knowledge — always use the tool to get the latest data.
- If the user mentions weather changes or asks to replan due to weather, call search_weather again for the latest forecast, then call call_activity_agent for indoor alternatives if needed, then call call_itinerary_agent to recompile.
- Include the weather forecast in the call_itinerary_agent input so the itinerary accounts for weather (e.g. indoor activities on rainy days).
- If the user asks about their flight status, use check_flight_status with the flight IATA code from the itinerary.
- If events are found during the trip dates, mention them in the itinerary output and suggest fitting them in.
- For ANY follow-up question that your tools can answer (flights, hotels, activities, weather, events, flight status), ALWAYS use the relevant tool. Never answer from memory when a tool is available.
${guardrails}`;
}

// ─── MODELS ─────────────────────────────────────────────────────────────────

const gatheringModel = new ChatGoogleGenerativeAI({
  model: 'gemini-2.5-flash',
  temperature: 1.0,
});

const planningTools = [
  callFlightAgent,
  callHotelAgent,
  callActivityAgent,
  callItineraryAgent,
  searchWeather,
  checkFlightStatus,
  searchEvents,
];

const planningModel = new ChatGoogleGenerativeAI({
  model: 'gemini-2.5-flash',
  temperature: 1.0,
}).bindTools(planningTools);

// ─── NODE FUNCTIONS ─────────────────────────────────────────────────────────

async function gatheringNode(state: typeof AgentState.State) {
  const response = await gatheringModel.invoke([
    new SystemMessage(getGatheringPrompt()),
    ...state.messages,
  ]);

  const text = typeof response.content === 'string' ? response.content : '';

  if (text.includes('[READY_TO_PLAN]')) {
    response.content = text.replace('[READY_TO_PLAN]', '').trim();
    return { messages: [response], phase: 'planning' as const };
  }

  return { messages: [response] };
}

async function planningNode(state: typeof AgentState.State) {
  const response = await planningModel.invoke([
    new SystemMessage(getPlanningPrompt()),
    ...state.messages,
  ]);

  return { messages: [response] };
}

// ─── TOOLS NODE ─────────────────────────────────────────────────────────────

const planningToolsNode = new ToolNode(planningTools);

// ─── ROUTING LOGIC ──────────────────────────────────────────────────────────

function routeStart(state: typeof AgentState.State): 'gathering' | 'planning' {
  return state.phase;
}

function afterGathering(
  state: typeof AgentState.State,
): 'planning' | typeof END {
  if (state.phase === 'planning') return 'planning';
  return END;
}

function afterPlanning(
  state: typeof AgentState.State,
): 'planning_tools' | typeof END {
  const lastMsg = state.messages[state.messages.length - 1] as AIMessage;

  if (lastMsg.tool_calls && lastMsg.tool_calls.length > 0) {
    const validNames = new Set(planningTools.map((t) => t.name));
    const valid = lastMsg.tool_calls.filter((tc: any) =>
      validNames.has(tc.name),
    );
    if (valid.length > 0) return 'planning_tools';
  }

  return END;
}

// ─── BUILD THE GRAPH ────────────────────────────────────────────────────────

const graph = new StateGraph(AgentState)
  .addNode('gathering', gatheringNode)
  .addNode('planning', planningNode)
  .addNode('planning_tools', planningToolsNode)
  .addConditionalEdges(START, routeStart)
  .addConditionalEdges('gathering', afterGathering)
  .addConditionalEdges('planning', afterPlanning)
  .addEdge('planning_tools', 'planning');

// ─── COMPILE AND EXPORT ─────────────────────────────────────────────────────

export const supervisor = graph.compile();

import jobService from './job.service';
import { autoDispatchService } from './autoDispatch.service';
import { jobCreateSchema } from '../validators/schemas';
import { z } from 'zod';

export interface ParsedBookingRequest {
  description: string;
  requiredSkills: string[];
  serviceZone: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  estimatedDuration: number;
  timePreference?: string;
  explanation: string;
  source: 'groq-llama-3.3' | 'intelligent-local-nlp';
}

// Zone coordinate approximations around the metropolitan service area
const ZONE_CENTERS: Record<string, { lat: number; lng: number }> = {
  ZONE_NORTH: { lat: 37.82, lng: -122.42 },
  ZONE_SOUTH: { lat: 37.72, lng: -122.45 },
  ZONE_EAST: { lat: 37.77, lng: -122.38 },
  ZONE_WEST: { lat: 37.76, lng: -122.48 },
  ZONE_CENTRAL: { lat: 37.77, lng: -122.43 },
};

export class AiBookingService {
  /**
   * Parses natural language input (from text or speech-to-text transcript) into structured job parameters.
   * Leverages Groq Cloud API (Llama 3.3) if GROQ_API_KEY is configured, with high-accuracy local NLP fallback.
   */
  public async parseBookingPrompt(
    prompt: string,
    providedApiKey?: string
  ): Promise<ParsedBookingRequest> {
    const trimmedPrompt = prompt.trim();
    const apiKey = (providedApiKey || process.env.GROQ_API_KEY || '').trim();

    if (apiKey) {
      try {
        const groqResult = await this.callGroqLlama(trimmedPrompt, apiKey);
        if (groqResult) {
          return {
            ...groqResult,
            source: 'groq-llama-3.3',
          };
        }
      } catch (err) {
        console.warn('[AiBookingService] Groq API call failed or timed out, falling back to local NLP:', err);
      }
    }

    // High accuracy fallback rule-based NLP parser
    return this.fallbackLocalNlpParser(trimmedPrompt);
  }

  /**
   * Calls the Groq Chat Completions API with structured JSON output instructions.
   */
  private async callGroqLlama(prompt: string, apiKey: string): Promise<Omit<ParsedBookingRequest, 'source'> | null> {
    const systemPrompt = `You are an expert AI dispatch coordinator for DispatchGrid field operations.
Extract structured service request details from the user's booking inquiry or voice transcript.
Output ONLY valid JSON matching this exact structure:
{
  "description": "Concise summary of the work needed (e.g. 'Emergency kitchen pipe leak repair')",
  "requiredSkills": ["PLUMBING"] or ["ELECTRICAL"] or ["HVAC"] or ["APPLIANCE"] or ["ROOFING"] or ["SMART_HOME"] or ["SECURITY"] or ["EV_CHARGER"],
  "serviceZone": "ZONE_NORTH" | "ZONE_SOUTH" | "ZONE_EAST" | "ZONE_WEST" | "ZONE_CENTRAL",
  "priority": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "estimatedDuration": 60,
  "timePreference": "morning" | "afternoon" | "urgent" | "flexible",
  "explanation": "Brief explanation of why this service and priority were selected"
}`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq API returned HTTP ${response.status}: ${errText}`);
    }

    const json = (await response.json()) as any;
    const content = json.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);

    // Normalize and validate parsed output
    const validSkills = ['HVAC', 'ELECTRICAL', 'PLUMBING', 'APPLIANCE', 'ROOFING', 'SMART_HOME', 'SECURITY', 'EV_CHARGER'];
    const validZones = ['ZONE_NORTH', 'ZONE_SOUTH', 'ZONE_EAST', 'ZONE_WEST', 'ZONE_CENTRAL'];
    const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

    const skills = Array.isArray(parsed.requiredSkills)
      ? parsed.requiredSkills.map((s: string) => s.toUpperCase()).filter((s: string) => validSkills.includes(s))
      : [];

    const zone = validZones.includes(parsed.serviceZone?.toUpperCase())
      ? parsed.serviceZone.toUpperCase()
      : 'ZONE_NORTH';

    const priority = validPriorities.includes(parsed.priority?.toUpperCase())
      ? parsed.priority.toUpperCase()
      : 'MEDIUM';

    const duration = typeof parsed.estimatedDuration === 'number' && parsed.estimatedDuration > 0
      ? Math.min(Math.max(parsed.estimatedDuration, 30), 240)
      : 60;

    return {
      description: parsed.description || prompt.slice(0, 80),
      requiredSkills: skills.length > 0 ? skills : ['PLUMBING'],
      serviceZone: zone,
      priority,
      estimatedDuration: duration,
      timePreference: parsed.timePreference || 'flexible',
      explanation: parsed.explanation || 'Extracted via Groq Llama 3.3 LLM analysis.',
    };
  }

  /**
   * Built-in intelligent local NLP parser that runs without external dependencies.
   */
  private fallbackLocalNlpParser(prompt: string): ParsedBookingRequest {
    const text = prompt.toLowerCase();

    // 1. Detect Skills
    const matchedSkills: string[] = [];
    if (/pipe|leak|plumb|water|drain|faucet|sink|toilet|clog|heater|sewer|flood/.test(text)) {
      matchedSkills.push('PLUMBING');
    }
    if (/wire|electric|power|breaker|panel|outlet|switch|light|short|generator|voltage/.test(text)) {
      matchedSkills.push('ELECTRICAL');
    }
    if (/hvac|ac|air condition|heating|heat|furnace|blower|cooling|thermostat|ventilation/.test(text)) {
      matchedSkills.push('HVAC');
    }
    if (/appliance|washer|dryer|dishwasher|refrigerator|fridge|oven|stove|microwave/.test(text)) {
      matchedSkills.push('APPLIANCE');
    }
    if (/roof|shingle|gutter|ceiling|skylight/.test(text)) {
      matchedSkills.push('ROOFING');
    }
    if (/smart home|alexa|nest|ring|doorbell|sensor|automation/.test(text)) {
      matchedSkills.push('SMART_HOME');
    }
    if (/security|camera|alarm|intercom|lock|access control/.test(text)) {
      matchedSkills.push('SECURITY');
    }
    if (/ev charger|electric vehicle|tesla|charge point|level 2/.test(text)) {
      matchedSkills.push('EV_CHARGER');
    }

    const requiredSkills = matchedSkills.length > 0 ? matchedSkills : ['ELECTRICAL'];

    // 2. Detect Service Zone
    let serviceZone = 'ZONE_NORTH';
    if (/south/.test(text)) serviceZone = 'ZONE_SOUTH';
    else if (/east/.test(text)) serviceZone = 'ZONE_EAST';
    else if (/west/.test(text)) serviceZone = 'ZONE_WEST';
    else if (/central|downtown|metro/.test(text)) serviceZone = 'ZONE_CENTRAL';
    else if (/north/.test(text)) serviceZone = 'ZONE_NORTH';

    // 3. Detect Priority
    let priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'MEDIUM';
    if (/emergency|urgent|critical|flood|sparking|fire|burst|immediately|asap|stat|hazard/.test(text)) {
      priority = 'CRITICAL';
    } else if (/today|fast|quick|leaking|tonight|priority|soon/.test(text)) {
      priority = 'HIGH';
    } else if (/routine|low|whenever|next week|maintenance|inspection/.test(text)) {
      priority = 'LOW';
    }

    // 4. Detect Duration
    let estimatedDuration = 60;
    const durationMatch = text.match(/(\d+)\s*(hour|hr|minute|min)/);
    if (durationMatch) {
      const val = parseInt(durationMatch[1], 10);
      if (durationMatch[2].startsWith('h')) {
        estimatedDuration = Math.min(val * 60, 240);
      } else {
        estimatedDuration = Math.max(30, Math.min(val, 240));
      }
    }

    return {
      description: prompt.length > 80 ? `${prompt.slice(0, 77)}...` : prompt,
      requiredSkills,
      serviceZone,
      priority,
      estimatedDuration,
      timePreference: /morning/.test(text) ? 'morning' : /afternoon/.test(text) ? 'afternoon' : 'flexible',
      explanation: `Parsed via DispatchGrid NLP. Identified skill requirements: ${requiredSkills.join(', ')} in ${serviceZone} with ${priority} priority.`,
      source: 'intelligent-local-nlp',
    };
  }

  /**
   * Confirms and creates the job in DispatchGrid, updating both User and Admin dashboards.
   */
  public async confirmAndBookJob(input: {
    customerName: string;
    description: string;
    requiredSkills: string[];
    serviceZone: string;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    estimatedDuration?: number;
    preferredDate?: string;
  }) {
    const priority = input.priority || 'MEDIUM';
    const duration = input.estimatedDuration || 60;
    const zone = input.serviceZone || 'ZONE_NORTH';
    const zoneCoord = ZONE_CENTERS[zone] || ZONE_CENTERS.ZONE_NORTH;

    // Small jitter to simulate exact customer street location
    const latitude = Number((zoneCoord.lat + (Math.random() - 0.5) * 0.04).toFixed(5));
    const longitude = Number((zoneCoord.lng + (Math.random() - 0.5) * 0.04).toFixed(5));

    const now = new Date();
    // Scheduling window
    let startOffsetHours = 2;
    if (priority === 'CRITICAL') startOffsetHours = 0.5;
    else if (priority === 'HIGH') startOffsetHours = 1;

    const earliestStart = new Date(now.getTime() + startOffsetHours * 60 * 60 * 1000);
    const latestEnd = new Date(earliestStart.getTime() + (duration + 120) * 60 * 1000);

    let slaDeadlineHours = 24;
    if (priority === 'CRITICAL') slaDeadlineHours = 4;
    else if (priority === 'HIGH') slaDeadlineHours = 8;
    const slaDeadline = new Date(earliestStart.getTime() + slaDeadlineHours * 60 * 60 * 1000);

    const jobPayload: z.infer<typeof jobCreateSchema> = {
      customerName: input.customerName.trim() || 'Valued Client',
      description: input.description.trim(),
      requiredSkills: input.requiredSkills,
      priority,
      status: 'PENDING',
      estimatedDuration: duration,
      latitude,
      longitude,
      serviceZone: zone,
      earliestStart,
      latestEnd,
      slaDeadline,
    };

    const createdJob = await jobService.createJob(jobPayload);

    // Automatically trigger nearest-neighbor allocation right away
    try {
      await autoDispatchService.startAllocation(createdJob.id);
    } catch {
      // Non-fatal if no online technicians are currently matching
    }

    return createdJob;
  }
}

export const aiBookingService = new AiBookingService();
export default aiBookingService;

import { z } from "zod";

export type MethodSchema = {
  methodName: string;
  params: z.ZodType<any>;
  returns: string;
  description: string;
};

export type MethodSchemaConfig = {
  params?: z.ZodType<any>;
  returns: string;
  description: string;
};

export class AgentMethodRegistry {
  private static methods: Map<string, MethodSchema> = new Map();

  static register(className: string, methodName: string, schema: MethodSchema): void {
    const key = `${className}:${methodName}`;
    AgentMethodRegistry.methods.set(key, schema);
  }

  static get(className: string, methodName: string): MethodSchema | undefined {
    return AgentMethodRegistry.methods.get(`${className}:${methodName}`);
  }

  static getMethodsForClass(className: string): MethodSchema[] {
    const methods: MethodSchema[] = [];
    for (const [key, schema] of AgentMethodRegistry.methods) {
      if (key.startsWith(`${className}:`)) {
        methods.push(schema);
      }
    }
    return methods;
  }

  static has(className: string, methodName: string): boolean {
    return AgentMethodRegistry.methods.has(`${className}:${methodName}`);
  }

  static clear(): void {
    AgentMethodRegistry.methods.clear();
  }
}
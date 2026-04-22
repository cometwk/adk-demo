import { z } from "zod";
import { AgentMethodRegistry } from "./registry";
import type { MethodSchema, MethodSchemaConfig } from "./registry";

export function agentMethod(config: MethodSchemaConfig) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const className = target.constructor.name;

    const schema: MethodSchema = {
      methodName: propertyKey,
      params: config.params ?? z.object({}),
      returns: config.returns,
      description: config.description,
    };

    AgentMethodRegistry.register(className, propertyKey, schema);

    return descriptor;
  };
}

export { AgentMethodRegistry } from "./registry";
export type { MethodSchema, MethodSchemaConfig } from "./registry";
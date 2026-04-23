import { z } from "zod";
import type {
	MethodSchema,
	MethodSchemaConfig,
	PropertySchema,
	PropertySchemaConfig,
} from "./registry";
import { AgentMethodRegistry, AgentPropertyRegistry } from "./registry";

export function agentMethod(config: MethodSchemaConfig) {
	return (
		target: any,
		propertyKey: string,
		descriptor: PropertyDescriptor,
	): PropertyDescriptor => {
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

export function agentProperty(config: PropertySchemaConfig) {
	return (target: any, propertyKey: string): void => {
		const className = target.constructor.name;

		const schema: PropertySchema = {
			propertyName: propertyKey,
			returns: config.returns,
			description: config.description,
		};

		AgentPropertyRegistry.register(className, propertyKey, schema);
	};
}

export type {
	MethodSchema,
	MethodSchemaConfig,
	PropertySchema,
	PropertySchemaConfig,
} from "./registry";
export { AgentMethodRegistry, AgentPropertyRegistry } from "./registry";

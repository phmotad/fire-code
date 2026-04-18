import { z } from 'zod';

type JsonSchemaProperty = {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  items?: JsonSchemaProperty;
  oneOf?: JsonSchemaProperty[];
  anyOf?: JsonSchemaProperty[];
};

type JsonSchema = {
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
};

// Minimal Zod-to-JSON-Schema converter (avoids heavy zod-to-json-schema dependency)
export function zodToJsonSchema(schema: z.ZodTypeAny): JsonSchema {
  function convert(s: z.ZodTypeAny): JsonSchemaProperty {
    if (s instanceof z.ZodObject) {
      const shape = s.shape as Record<string, z.ZodTypeAny>;
      const properties: Record<string, JsonSchemaProperty> = {};
      const required: string[] = [];
      for (const [k, v] of Object.entries(shape)) {
        properties[k] = convert(v);
        if (!(v instanceof z.ZodOptional) && !(v instanceof z.ZodDefault)) {
          required.push(k);
        }
      }
      return { type: 'object', properties, required: required.length ? required : undefined };
    }
    if (s instanceof z.ZodString) {
      const prop: JsonSchemaProperty = { type: 'string' };
      const desc = (s as z.ZodString)._def.description;
      if (desc) prop.description = desc;
      return prop;
    }
    if (s instanceof z.ZodNumber) {
      return { type: 'number' };
    }
    if (s instanceof z.ZodBoolean) {
      return { type: 'boolean' };
    }
    if (s instanceof z.ZodEnum) {
      return { type: 'string', enum: (s as z.ZodEnum<[string, ...string[]]>).options };
    }
    if (s instanceof z.ZodOptional) {
      return convert(s.unwrap() as z.ZodTypeAny);
    }
    if (s instanceof z.ZodDefault) {
      const inner = convert((s as z.ZodDefault<z.ZodTypeAny>)._def.innerType as z.ZodTypeAny);
      inner.default = (s as z.ZodDefault<z.ZodTypeAny>)._def.defaultValue();
      return inner;
    }
    if (s instanceof z.ZodArray) {
      return { type: 'array', items: convert((s as z.ZodArray<z.ZodTypeAny>).element) };
    }
    return {};
  }

  const result = convert(schema);
  return result as JsonSchema;
}

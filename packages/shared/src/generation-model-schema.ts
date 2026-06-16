export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type AimcUiControl =
  | "hidden"
  | "select"
  | "segmented"
  | "imageUpload"
  | "number"
  | "toggle";

export type AimcUploadSlotId =
  | "firstFrame"
  | "lastFrame"
  | "referenceImages"
  | "inputImages";

export type AimcInputMode = {
  id: "text" | "image" | "keyframes" | "reference" | "multivideo" | "video";
  labelKey: string;
  videoMode?: "multivideo" | "keyframes" | "reference";
  minImages?: number;
  maxImages?: number;
  limits?: {
    allowedDurations?: readonly number[];
    maxDuration?: number;
    resolutions?: readonly string[];
  };
  requiresInputVideo?: boolean;
  slots?: AimcUploadSlotId[];
};

export type AimcUiField = {
  path: string;
  control: AimcUiControl;
  labelKey?: string;
  order?: number;
  group?: string;
  uploadSlot?: AimcUploadSlotId;
};

export type AimcModelUiSchema = {
  mediaType: "image" | "video";
  fields: AimcUiField[];
  inputModes?: AimcInputMode[];
};

export type JsonSchemaObject = {
  $schema?: string;
  $id?: string;
  title?: string;
  description?: string;
  type?: string | string[];
  properties?: Record<string, JsonSchemaObject>;
  required?: string[];
  enum?: JsonValue[];
  const?: JsonValue;
  default?: JsonValue;
  examples?: JsonValue[];
  items?: JsonSchemaObject;
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  additionalProperties?: boolean | JsonSchemaObject;
  oneOf?: JsonSchemaObject[];
  anyOf?: JsonSchemaObject[];
  allOf?: JsonSchemaObject[];
  not?: JsonSchemaObject;
  if?: JsonSchemaObject;
  then?: JsonSchemaObject;
  else?: JsonSchemaObject;
  "x-aimc-ui"?: AimcModelUiSchema;
  "x-aimc-provider"?: Record<string, JsonValue>;
};

export type GenerationModelSchema = JsonSchemaObject & {
  $schema: "https://json-schema.org/draft/2020-12/schema";
  type: "object";
  properties: Record<string, JsonSchemaObject>;
  "x-aimc-ui": AimcModelUiSchema;
};

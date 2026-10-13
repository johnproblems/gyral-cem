// VS Code custom data (`html-custom-data.json`): tag and attribute completion
// for `.html` files, closing the editor-data gap from the PRD. Wired up with:
//   "html.customData": ["./dist/typings/html-custom-data.json"]
import type { ComponentIR } from '../ir.js';

export interface CustomDataAttribute {
  readonly name: string;
  readonly description?: string;
}

export interface CustomDataTag {
  readonly name: string;
  readonly description?: string;
  readonly attributes: readonly CustomDataAttribute[];
}

export interface CustomDataDocument {
  readonly version: 1.1;
  readonly tags: readonly CustomDataTag[];
}

export function buildCustomData(components: readonly ComponentIR[]): CustomDataDocument {
  return {
    version: 1.1,
    tags: components.map((component) => {
      const description = component.description ?? component.summary;
      return {
        name: component.tag,
        ...(description !== undefined ? { description } : {}),
        attributes: component.props.flatMap((prop) => {
          if (prop.attribute === undefined) return [];
          const attrDescription = prop.description ?? prop.summary;
          return [
            {
              name: prop.attribute,
              ...(attrDescription !== undefined ? { description: attrDescription } : {}),
            },
          ];
        }),
      };
    }),
  };
}

export function generateCustomData(components: readonly ComponentIR[]): string {
  return `${JSON.stringify(buildCustomData(components), null, 2)}\n`;
}

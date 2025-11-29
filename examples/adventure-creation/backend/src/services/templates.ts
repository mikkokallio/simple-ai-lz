import { cosmosService } from './cosmos.js';

export interface Template {
  id: string;
  name: string;
  description: string;
  timeStr: string;
  encounters: any[];
  connections: any[];
  createdBy: string;
  createdAt: number;
  isCustom: boolean;
}

class TemplateService {
  async createTemplate(data: {
    name: string;
    description: string;
    timeStr: string;
    encounters: any[];
    connections: any[];
    createdBy: string;
  }): Promise<Template> {
    const template: Template = {
      id: crypto.randomUUID(),
      ...data,
      isCustom: true,
      createdAt: Date.now(),
    };

    await cosmosService.createTemplate(template);
    console.log(`Created template: ${template.name}`);
    return template;
  }

  async listTemplates(): Promise<Template[]> {
    return cosmosService.listTemplates();
  }

  async deleteTemplate(id: string): Promise<void> {
    await cosmosService.deleteTemplate(id);
    console.log(`Deleted template: ${id}`);
  }
}

export const templateService = new TemplateService();

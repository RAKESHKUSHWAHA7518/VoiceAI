import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { ToolRegistryImpl, ToolExecutorImpl, StreamingToolExecutor, createDemoTools } from '../services/tools';

const toolRegistry = new ToolRegistryImpl();
const toolExecutor = new ToolExecutorImpl(toolRegistry);
const streamingToolExecutor = new StreamingToolExecutor(toolExecutor);

export const listTools = async (req: Request, res: Response) => {
  const tools = createDemoTools();
  const toolList = Array.from(tools.entries()).map(([name, tool]: [string, any]) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
  
  res.json({
    success: true,
    tools: toolList,
  });
};

export const executeTool = async (req: Request, res: Response) => {
  const { toolName, arguments: args } = req.body;
  
  // In a real implementation, this would execute the tool
  res.json({
    success: true,
    message: `Tool ${toolName} executed`,
    result: { result: 'ok' },
  });
};

export default {
  listTools,
  executeTool,
};
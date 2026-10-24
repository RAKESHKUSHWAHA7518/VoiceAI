import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { getAllToolsMap, registerCustomTool, updateTool, deleteCustomTool, fetchLiveWeather } from '../services/tools';

const router = Router();

// GET all tools (built-in + custom)
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const allTools = getAllToolsMap();
    const toolList = Array.from(allTools.values()).map((tool: any) => ({
      name: tool.name,
      label: tool.label || tool.name,
      description: tool.description,
      parameters: tool.parameters,
      execution_type: tool.execution_type || (tool.name === 'get_weather' ? 'live_weather' : 'mock'),
      mock_response: tool.mock_response,
      webhook_url: tool.webhook_url,
      is_custom: !!tool.is_custom,
    }));
    
    res.json({
      success: true,
      tools: toolList,
    });
  })
);

// POST register a new custom tool
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { name, label, description, parameters, execution_type, mock_response, webhook_url } = req.body;
    
    if (!name || !description) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Tool name and description are required' },
      });
    }

    const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');

    registerCustomTool({
      name: cleanName,
      label: label || cleanName,
      description,
      parameters: parameters || {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Query argument' },
        },
        required: ['query'],
      },
      execution_type: execution_type || 'mock',
      mock_response,
      webhook_url,
    });

    const allTools = getAllToolsMap();
    const toolList = Array.from(allTools.values()).map((t: any) => ({
      name: t.name,
      label: t.label || t.name,
      description: t.description,
      parameters: t.parameters,
      execution_type: t.execution_type || (t.name === 'get_weather' ? 'live_weather' : 'mock'),
      mock_response: t.mock_response,
      webhook_url: t.webhook_url,
      is_custom: !!t.is_custom,
    }));

    res.json({
      success: true,
      message: `Custom tool "${cleanName}" registered successfully`,
      tool: allTools.get(cleanName),
      tools: toolList,
    });
  })
);

// PUT update an existing tool (built-in or custom)
router.put(
  '/:toolName',
  asyncHandler(async (req: Request, res: Response) => {
    const { toolName } = req.params;
    const { label, description, parameters, execution_type, mock_response, webhook_url } = req.body;

    const allTools = getAllToolsMap();
    if (!allTools.has(toolName)) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Tool "${toolName}" not found` },
      });
    }

    const updated = updateTool(toolName, {
      label,
      description,
      parameters,
      execution_type,
      mock_response,
      webhook_url,
    });

    const refreshedTools = getAllToolsMap();
    const toolList = Array.from(refreshedTools.values()).map((t: any) => ({
      name: t.name,
      label: t.label || t.name,
      description: t.description,
      parameters: t.parameters,
      execution_type: t.execution_type || (t.name === 'get_weather' ? 'live_weather' : 'mock'),
      mock_response: t.mock_response,
      webhook_url: t.webhook_url,
      is_custom: !!t.is_custom,
    }));

    res.json({
      success: true,
      message: `Tool "${toolName}" updated successfully`,
      tool: updated,
      tools: toolList,
    });
  })
);

// POST test a specific tool
router.post(
  '/:toolName/test',
  asyncHandler(async (req: Request, res: Response) => {
    const { toolName } = req.params;
    const executionArgs = req.body.arguments || req.body.args || {};

    const allTools = getAllToolsMap();
    const tool = allTools.get(toolName);

    if (!tool) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Tool "${toolName}" not found` },
      });
    }

    try {
      let result;
      if (tool.name === 'get_weather' && (!tool.execution_type || tool.execution_type === 'live_weather')) {
        result = await fetchLiveWeather(executionArgs.location || 'New Delhi');
      } else if (typeof tool.handler === 'function') {
        result = await tool.handler(executionArgs);
      } else if (tool.mock_response) {
        try {
          result = JSON.parse(tool.mock_response);
        } catch {
          result = { result: tool.mock_response };
        }
      } else {
        result = { status: 'success', executed: tool.name, args: executionArgs };
      }

      res.json({
        success: true,
        tool_name: toolName,
        args: executionArgs,
        result,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'EXECUTION_ERROR', message: err.message },
      });
    }
  })
);

// POST execute a tool directly
router.post(
  '/execute',
  asyncHandler(async (req: Request, res: Response) => {
    const { tool_name, toolName, arguments: rawArgs, args } = req.body;
    const name = tool_name || toolName;
    const executionArgs = args || rawArgs || {};

    const allTools = getAllToolsMap();
    const tool = allTools.get(name);

    if (!tool) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Tool "${name}" not found` },
      });
    }

    try {
      const result = await tool.handler(executionArgs);
      res.json({
        success: true,
        tool_name: name,
        result,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { code: 'EXECUTION_ERROR', message: err.message },
      });
    }
  })
);

// DELETE a custom tool
router.delete(
  '/:toolName',
  asyncHandler(async (req: Request, res: Response) => {
    const { toolName } = req.params;
    const deleted = deleteCustomTool(toolName);

    if (!deleted) {
      return res.status(400).json({
        success: false,
        error: { code: 'CANNOT_DELETE', message: `Tool "${toolName}" is built-in or not found` },
      });
    }

    const allTools = getAllToolsMap();
    const toolList = Array.from(allTools.values()).map((t: any) => ({
      name: t.name,
      label: t.label || t.name,
      description: t.description,
      parameters: t.parameters,
      execution_type: t.execution_type || (t.name === 'get_weather' ? 'live_weather' : 'mock'),
      mock_response: t.mock_response,
      webhook_url: t.webhook_url,
      is_custom: !!t.is_custom,
    }));

    res.json({
      success: true,
      message: `Tool "${toolName}" deleted`,
      tools: toolList,
    });
  })
);

// GET tool schema
router.get(
  '/:toolName/schema',
  asyncHandler(async (req: Request, res: Response) => {
    const allTools = getAllToolsMap();
    const tool = allTools.get(req.params.toolName);
    
    if (!tool) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Tool not found' },
      });
    }
    
    res.json({
      success: true,
      schema: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    });
  })
);

export default router;
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const isProduction = process.env.NODE_ENV === 'production';

  app.use(express.json({ limit: '15mb' }));

  // Initialize Gemini API with modern @google/genai SDK
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // POST /api/ai-master - Exclusivo para Admin Master
  app.post('/api/ai-master', async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({
          error: 'Chave da API Gemini não configurada. Verifique o painel Settings > Secrets.'
        });
      }

      const { prompt, context, userEmail } = req.body || {};

      // Master Admin verification
      const normalizedEmail = typeof userEmail === 'string' ? userEmail.trim().toLowerCase() : '';
      const isMasterEmail =
        normalizedEmail === 'ramonbelem1@gmail.com' ||
        normalizedEmail === 'ramoncxavier88@gmail.com' ||
        normalizedEmail === 'ramoncarvalhoxavier@hotmail.com';

      if (!isMasterEmail) {
        return res.status(403).json({
          error: 'Acesso restrito exclusivamente ao Administrador Master.'
        });
      }

      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        return res.status(400).json({ error: 'A pergunta ou instrução é obrigatória.' });
      }

      const systemInstruction = `Você é o "Boleiros IA", um assistente analista sênior de futebol e inteligência de dados, exclusivo para o Administrador Master do aplicativo Boleiros PRO.
Você recebe dados atualizados em tempo real do grupo de pelada, incluindo:
- Lista completa de atletas (nome, tipo mensalista/diarista, posição, gols, assistências, vitórias, derrotas, empates, status ativo/inativo).
- Histórico de transações financeiras (pagamentos de mensalidades categorizados por atleta e mês de referência ex: "2026-05", arrecadação de diaristas, despesas).
- Histórico de partidas (jogos realizados, confirmações de presença, faltas, fila de espera).

Suas diretrizes:
1. Responda em Português do Brasil com tom profissional, direto e amigável.
2. Quando solicitado "atletas com mais meses ativos / contribuição de mensalidades", examine cuidadosamente as transações de mensalidade ('MONTHLY') e liste nominalmente quem pagou quantos meses, destacando os mais fiéis e os que têm menos meses ou estão sem contribuição.
3. Quando perguntado sobre jogos, presenças ou artilharia, cite os números exatos e ordene em ranking de forma clara e visual.
4. Utilize formatação limpa em markdown: títulos curtos, listas com marcadores ou tabelas quando apropriado, destacando valores e nomes em negrito.
5. Se algum dado não estiver disponível no histórico, seja transparente e responda com base nos dados reais existentes no contexto fornecido.`;

      const promptPayload = `Dados do aplicativo da pelada (JSON):
${JSON.stringify(context || {})}

Pergunta do Administrador Master:
"${prompt.trim()}"`;

      const callGemini = async (model: string) => {
        return ai.models.generateContent({
          model,
          contents: promptPayload,
          config: {
            systemInstruction
          }
        });
      };

      let response: any = null;
      const modelsToTry = ['gemini-4-hydrogen', 'gemini-4-hydrogen', 'gemini-3.1-flash-lite'];
      let lastErr: any = null;

      for (let i = 0; i < modelsToTry.length; i++) {
        try {
          response = await callGemini(modelsToTry[i]);
          lastErr = null;
          break;
        } catch (err: any) {
          lastErr = err;
          const msg = String(err?.message || '');
          const isTransient = err?.status === 503 || err?.status === 429 || msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand');
          if (!isTransient || i === modelsToTry.length - 1) {
            throw err;
          }
          await new Promise(resolve => setTimeout(resolve, 800 * (i + 1)));
        }
      }

      if (lastErr && !response) {
        throw lastErr;
      }

      const text = response?.text || 'Não consegui formular uma resposta com os dados atuais.';
      return res.json({ answer: text });
    } catch (err: any) {
      console.error('Erro no processamento da IA Master:', err);
      const status = typeof err?.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;
      const rawMsg = String(err?.message || '');
      let errorMessage = rawMsg || 'Falha ao consultar a Inteligência Artificial.';
      if (status === 503 || rawMsg.includes('UNAVAILABLE') || rawMsg.includes('high demand')) {
        errorMessage = 'O serviço de IA está com alta demanda temporária. Tente novamente em alguns segundos.';
      } else if (status === 403 || rawMsg.includes('PERMISSION_DENIED') || rawMsg.includes('API_KEY_INVALID')) {
        errorMessage = 'Chave da API Gemini inválida ou sem permissão. Verifique o painel Settings > Secrets.';
      } else if (status === 429 || rawMsg.includes('RESOURCE_EXHAUSTED')) {
        errorMessage = 'Limite de requisições da IA atingido temporariamente. Aguarde alguns instantes.';
      }
      return res.status(status).json({ error: errorMessage });
    }
  });

  app.all('/api/*', (_req, res) => {
    return res.status(404).json({ error: 'Endpoint de API não encontrado.' });
  });

  const SERVER_BUILD_ID = process.env.BUILD_ID || String(Date.now());

  const setNoCacheHeaders = (res: express.Response) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  };

  if (!isProduction) {
    app.get('/version.json', (_req, res) => {
      setNoCacheHeaders(res);
      res.json({ version: 'dev' });
    });

    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        host: '0.0.0.0',
        port: PORT,
        ...(process.env.DISABLE_HMR === 'true' ? { hmr: false } : {})
      },
      appType: 'spa',
    });
    app.use((req, res, next) => {
      if (req.path === '/' || req.path.endsWith('.html') || req.path === '/manifest.json') {
        setNoCacheHeaders(res);
      }
      next();
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.get('/version.json', (_req, res) => {
      setNoCacheHeaders(res);
      res.sendFile(path.join(distDir, 'version.json'), (err) => {
        if (err && !res.headersSent) {
          res.json({ version: SERVER_BUILD_ID });
        }
      });
    });

    app.use(express.static(distDir, {
      setHeaders: (res, filePath) => {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          setNoCacheHeaders(res);
        }
      }
    }));

    app.get('*', (_req, res) => {
      setNoCacheHeaders(res);
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Boleiros PRO] Servidor rodando na porta ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Falha crítica ao iniciar o servidor:', err);
});

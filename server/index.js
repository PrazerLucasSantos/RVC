// Inicialização do servidor HTTP e do processador da fila de NFS-e.
process.env.TZ ||= 'America/Sao_Paulo';
import { fileURLToPath } from 'node:url';

const { default: express } = await import('express');
const { api } = await import('./api.js');
const { db, empresa } = await import('./db.js');
const { danfseHtml } = await import('./nfse/danfse.js');
const { iniciarWorker } = await import('./nfse/servico.js');
const { ErroNegocio } = await import('./util.js');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '200kb' }));
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'no-referrer');
  next();
});

app.use('/api', api);

// Link público da nota (enviado ao cliente por WhatsApp/e-mail). Token aleatório de 128 bits.
app.get('/nota/:token', (req, res) => {
  const n = db.prepare("SELECT * FROM nfse WHERE token_publico = ? AND situacao IN ('AUTORIZADA','CANCELANDO','CANCELADA')").get(req.params.token);
  if (!n) return res.status(404).send('Nota não encontrada.');
  res.type('html').send(danfseHtml(n, empresa()));
});

app.use(express.static(fileURLToPath(new URL('../public', import.meta.url)), { extensions: ['html'] }));

app.use((err, req, res, next) => {
  if (err instanceof ErroNegocio) return res.status(err.status).json({ erro: err.message, campo: err.campo });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ erro: 'Requisição inválida.' });
  if (String(err?.message).includes('UNIQUE constraint failed: nfse.atendimento_id')) {
    return res.status(409).json({ erro: 'Este atendimento já possui uma nota em andamento ou emitida.' });
  }
  console.error(err);
  res.status(500).json({ erro: 'Erro interno. Tente novamente; se persistir, avise o administrador.' });
});

const porta = Number(process.env.PORT || 3000);
app.listen(porta, () => {
  console.log(`RVC Lava-Car rodando em http://localhost:${porta}`);
  iniciarWorker();
});

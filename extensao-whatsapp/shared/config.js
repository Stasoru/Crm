/*
  Configuração da marca (white-label) e valores padrão do armazenamento.
  Para trocar a marca, altere apenas BRAND e os ícones da pasta /icons.
*/
(function (g) {
  const BRAND = {
    name: 'Beco WppSeller',
    primary: '#EFA528',
    primaryText: '#1a1206',
    version: '1.3.0'
  };

  const WHATSAPP_URL = 'https://web.whatsapp.com/*';

  // Data de amanhã no formato AAAA-MM-DD (primeiro backup automático)
  function tomorrow() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  // Módulos incluídos no backup automático (mesma lista de dados da extensão)
  const BACKUP_ITEMS = [
    'respostasRapidas', 'categoria', 'agendamentos', 'agendamentosNaoDisparados',
    'sendAfterWhatsAppOpens', 'crm', 'contatos', 'notes', 'notifications', 'perfil',
    'userTabs', 'agrupamentos', 'relatorio', 'encomendas', 'autoatendimento', 'webhook',
    'IA', 'status', 'pinChat', 'atendimento', 'backupAutomatico', 'replacementStorage',
    'FollowUp', 'fluxo', 'useNotification', 'produtos', 'vendas'
  ];

  const DEFAULTS = {
    respostasRapidas: [],          // {id, titulo, categoriaId, texto, midias:[{nome,tipo,dataUrl}], atalho}
    categoria: [],                 // {id, nome, cor}
    agendamentos: [],              // {id, chatId, nome, mensagem, respostaId, fluxoId, quando, recorrencia, status, erro}
    agendamentosNaoDisparados: [],
    sendAfterWhatsAppOpens: false,  // envia agendamentos atrasados quando o WhatsApp abrir
    notifications: [],             // lembretes {id, chatId, nome, titulo, date, time, timeOut, read}
    userTabs: [],                  // abas personalizadas {id, nome, chats:[{id,nome}]}
    contatos: [],                  // contatos salvos {chatId, nome, telefone, email, empresa, etiquetas}
    notes: [],                     // notas {id, chatId, texto, criadoEm}
    perfil: {},                    // dados do atendente {nome, assinatura, usarAssinatura}
    crm: {                         // funil/kanban
      etapas: [
        { id: 'novo', nome: 'Novo lead', cor: '#3b82f6' },
        { id: 'negociando', nome: 'Em negociação', cor: '#f59e0b' },
        { id: 'proposta', nome: 'Proposta enviada', cor: '#8b5cf6' },
        { id: 'ganho', nome: 'Fechado', cor: '#10b981' },
        { id: 'perdido', nome: 'Perdido', cor: '#ef4444' }
      ],
      cards: []                    // {id, etapaId, chatId, nome, telefone, valor, observacao, etiquetas, criadoEm, atualizadoEm}
    },
    fluxo: { workflows: [], currentWorkflow: null }, // {id, nome, passos:[{tipo:'texto'|'midia'|'espera'|'resposta', ...}]}
    relatorio: [],                 // {id, tipo, chatId, data, ok}
    encomendas: [],                // pedidos {id, chatId, cliente, itens, valor, status, data}
    autoatendimento: { ativo: false, regras: [], historico: {} }, // regras do robô
    FollowUp: [],                  // {id, chatId, nome, mensagem, horas, criadoEm, dueAt, cancelarSeResponder, status}
    webhook: [],                   // {id, url, eventos:[], ativo}
    IA: { activeIA: 'Gemini', keyGemini: '', keyGPT: '', keyGroq: '', prompt: '' },
    status: [],                    // status agendado {id, texto, cor, quando, status}
    pinChat: [],                   // conversas fixadas {id, nome}
    atendimento: { privacidade: false, assinatura: false },
    replacementStorage: { items: [], isEnabled: true }, // atalhos de texto {atalho, texto}
    agrupamentos: [],              // listas de envio em massa {id, nome, contatos:[{telefone,nome}]}
    useNotification: true,
    conversas: { atualizadoEm: null, lista: [] }, // cópia da lista de conversas do WhatsApp para o kanban
    produtos: [],                  // catálogo {id, nome, preco, descricao, sku, imagem:{nome,tipo,dataUrl}}
    vendas: {                      // preferências do vendedor
      meta: 0,                     // meta de vendas do mês (R$)
      diasParado: 3,               // lead sem movimento há X dias aparece em "Hoje"
      esperaMin: 15,               // cliente esperando resposta há X minutos
      chavePix: '', nomePix: '', cidadePix: '',
      posVendaAtivo: true, posVendaDias: 3,
      posVendaMsg: '{saudacao}, {primeiro_nome}! Seu pedido chegou direitinho? Ficou alguma dúvida? Se puder, me conta o que achou 😊',
      barraFavoritas: true
    },
    backupAutomatico: { date: tomorrow(), items: BACKUP_ITEMS, recurrency: 'diario', time: '10:30', ativo: false },
    initDate: false
  };

  g.FZ_CONFIG = { BRAND, WHATSAPP_URL, DEFAULTS, BACKUP_ITEMS };
})(globalThis);

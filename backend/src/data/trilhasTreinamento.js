// Conteudo das trilhas de treinamento (Etapa 6c). Texto curto em
// linguagem simples para servidores de camara + questionario de 3
// perguntas por modulo (concluido com 2 acertos ou mais).
// MINUTA: conteudo para revisao da camara/comissao juridica.
// Os moduloId sao estaveis (progresso e certificados ja emitidos
// referenciam esses ids). "correta" e o indice da alternativa certa e
// nunca vai para o navegador.
const MINUTA = true;

module.exports = [
  {
    id: 'introducao-lgpd',
    titulo: 'Introdução à LGPD',
    descricao: 'O que é a Lei Geral de Proteção de Dados Pessoais e como ela se aplica ao dia a dia da Câmara.',
    nivel: 'Básico',
    modulos: [
      {
        moduloId: 'o-que-e-lgpd',
        titulo: 'O que é a LGPD?',
        descricao: 'Dado pessoal, dado sensível, titular, controlador e encarregado — com exemplos da Câmara.',
        duracaoMin: 10,
        minuta: MINUTA,
        conteudo: [
          { tipo: 'p', texto: 'A Lei nº 13.709/2018, a LGPD, define regras para o uso de informações sobre pessoas. Ela vale também para o poder público, inclusive para a Câmara.' },
          { tipo: 'p', texto: 'Dado pessoal é qualquer informação ligada a uma pessoa identificada ou que possa ser identificada: nome, CPF, endereço, telefone, e-mail, matrícula, foto.' },
          { tipo: 'p', texto: 'Alguns dados exigem cuidado redobrado: são os dados pessoais sensíveis, como saúde, origem racial ou étnica, religião, opinião política, filiação a sindicato, vida sexual, dado genético e biometria.' },
          { tipo: 'lista', titulo: 'Quem é quem', itens: [
            'Titular: a pessoa a quem os dados se referem (cidadão, servidor, vereador, fornecedor).',
            'Controlador: a Câmara, que decide como os dados são usados.',
            'Encarregado: a pessoa indicada pela Câmara para atender os titulares e orientar os servidores.'
          ] },
          { tipo: 'p', texto: 'Tratamento é tudo o que se faz com o dado: coletar, consultar, copiar, guardar, enviar, publicar e até apagar.' },
          { tipo: 'dica', texto: 'Na Câmara há dados pessoais em protocolos, folha de pagamento, cadastro de visitantes, processos legislativos e no portal. Em todos eles a LGPD se aplica.' }
        ],
        quiz: [
          { pergunta: 'Qual destas informações é um dado pessoal?', alternativas: ['O CPF de um cidadão que protocolou um pedido', 'O orçamento anual da Câmara', 'O número de cadeiras do plenário'], correta: 0 },
          { pergunta: 'Quem é o controlador dos dados tratados pela Câmara?', alternativas: ['O servidor que digitou os dados', 'A própria Câmara', 'A empresa que fornece o computador'], correta: 1 },
          { pergunta: 'Um atestado médico de um servidor contém que tipo de dado?', alternativas: ['Dado público, que pode ser divulgado', 'Dado anônimo', 'Dado pessoal sensível, que exige cuidado redobrado'], correta: 2 }
        ]
      },
      {
        moduloId: 'principios-lgpd',
        titulo: 'Princípios e cuidados no dia a dia',
        descricao: 'Os princípios da lei traduzidos em atitudes simples no trabalho.',
        duracaoMin: 10,
        minuta: MINUTA,
        conteudo: [
          { tipo: 'p', texto: 'A LGPD traz princípios que orientam todo uso de dados pessoais. Os mais presentes no dia a dia são: finalidade, necessidade, transparência e segurança.' },
          { tipo: 'lista', titulo: 'Na prática', itens: [
            'Finalidade: use o dado só para o motivo pelo qual ele foi coletado.',
            'Necessidade: peça e guarde só o que é preciso para o atendimento.',
            'Transparência: a pessoa tem o direito de saber como seus dados são usados.',
            'Segurança: proteja os dados contra acesso indevido, perda ou vazamento.'
          ] },
          { tipo: 'lista', titulo: 'Atitudes simples', itens: [
            'Bloqueie a tela do computador ao sair da mesa.',
            'Não envie listas com dados pessoais por aplicativo de mensagem pessoal.',
            'Não deixe documentos com dados pessoais sobre a mesa ou na impressora.',
            'Descarte papel com dados pessoais de forma segura (por exemplo, triturando).',
            'Na dúvida, fale com o encarregado da Câmara.'
          ] },
          { tipo: 'dica', texto: 'Percebeu um vazamento, perda de documento ou acesso indevido? Avise o encarregado imediatamente: há prazos curtos para comunicar incidentes.' }
        ],
        quiz: [
          { pergunta: 'Ao abrir um protocolo, o servidor deve pedir ao cidadão:', alternativas: ['O máximo de dados, para o caso de precisar depois', 'Só os dados necessários para aquele atendimento', 'Cópia de todos os documentos pessoais'], correta: 1 },
          { pergunta: 'Um colega pede, pelo WhatsApp pessoal, a lista de servidores com CPF. O certo é:', alternativas: ['Enviar logo, porque é colega', 'Usar o canal oficial e enviar só se houver necessidade de serviço', 'Postar no grupo do setor'], correta: 1 },
          { pergunta: 'Você encontrou documentos com dados pessoais esquecidos na impressora. O que fazer?', alternativas: ['Recolher, entregar ao responsável e, se houver risco, avisar o encarregado', 'Deixar onde está', 'Jogar no lixo comum'], correta: 0 }
        ]
      }
    ]
  },
  {
    id: 'direitos-titulares',
    titulo: 'Direitos dos Titulares',
    descricao: 'Os direitos das pessoas sobre seus dados e como a Câmara atende os pedidos.',
    nivel: 'Intermediário',
    modulos: [
      {
        moduloId: 'direitos-do-titular',
        titulo: 'Quais são os direitos do titular?',
        descricao: 'Os direitos do art. 18 da LGPD em linguagem simples.',
        duracaoMin: 10,
        minuta: MINUTA,
        conteudo: [
          { tipo: 'p', texto: 'Toda pessoa pode fazer pedidos à Câmara sobre os seus próprios dados pessoais. Esses direitos estão no art. 18 da LGPD.' },
          { tipo: 'lista', titulo: 'O titular pode pedir', itens: [
            'Confirmação de que a Câmara trata dados seus.',
            'Acesso aos seus dados.',
            'Correção de dados incompletos, errados ou desatualizados.',
            'Anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados fora da lei.',
            'Portabilidade dos dados.',
            'Eliminação dos dados tratados com o seu consentimento.',
            'Informação sobre com quem a Câmara compartilhou os seus dados.',
            'Informação sobre a possibilidade de não consentir e o que acontece se não consentir.',
            'Revogação do consentimento.'
          ] },
          { tipo: 'p', texto: 'O titular também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD). O atendimento dos pedidos é gratuito.' },
          { tipo: 'dica', texto: 'Recebeu um pedido sobre dados pessoais, por qualquer meio? Registre no canal do titular ou encaminhe ao encarregado no mesmo dia.' }
        ],
        quiz: [
          { pergunta: 'Um cidadão quer saber quais dados a Câmara tem sobre ele. Qual direito ele está exercendo?', alternativas: ['Portabilidade', 'Acesso', 'Revogação do consentimento'], correta: 1 },
          { pergunta: 'Recebi por e-mail um pedido de correção de dados. O que faço?', alternativas: ['Registro o pedido no canal do titular ou encaminho ao encarregado', 'Respondo de cabeça, sem registrar', 'Ignoro, porque não veio pelo protocolo'], correta: 0 },
          { pergunta: 'A Câmara pode cobrar taxa para atender pedidos de titulares?', alternativas: ['Sim, sempre', 'Só quando o pedido vem por e-mail', 'Não, o atendimento é gratuito'], correta: 2 }
        ]
      },
      {
        moduloId: 'responder-15-dias',
        titulo: 'Como atender um pedido dentro do prazo',
        descricao: 'Recebimento, verificação de identidade, providências e resposta.',
        duracaoMin: 10,
        minuta: MINUTA,
        conteudo: [
          { tipo: 'lista', titulo: 'Passo a passo', itens: [
            'Receber e registrar o pedido (o sistema gera o protocolo).',
            'Confirmar a identidade de quem pede, antes de entregar qualquer dado.',
            'Levantar as informações com os setores e registrar as providências tomadas.',
            'Responder ao titular, de forma clara, e registrar como a resposta foi enviada.'
          ] },
          { tipo: 'p', texto: 'A confirmação de existência ou o acesso em formato simplificado devem ser imediatos. A declaração completa (origem dos dados, critérios e finalidade) deve ser entregue em até 15 dias da data do pedido (art. 19 da LGPD).' },
          { tipo: 'p', texto: 'Se o pedido não puder ser atendido, a resposta deve dizer o motivo. Nunca deixe um pedido sem resposta.' },
          { tipo: 'dica', texto: 'Use os modelos de resposta do sistema: eles já trazem a estrutura e o contato do encarregado.' }
        ],
        quiz: [
          { pergunta: 'Qual o prazo para entregar a declaração completa de acesso aos dados?', alternativas: ['Até 15 dias da data do pedido', 'Até 30 dias úteis', 'Não há prazo'], correta: 0 },
          { pergunta: 'Antes de entregar dados pessoais a quem pediu, é importante:', alternativas: ['Pedir autorização a um vereador', 'Confirmar a identidade de quem está pedindo', 'Publicar o pedido no portal'], correta: 1 },
          { pergunta: 'Se o pedido não puder ser atendido, a Câmara deve:', alternativas: ['Arquivar sem responder', 'Responder explicando o motivo', 'Esperar o titular desistir'], correta: 1 }
        ]
      }
    ]
  }
];

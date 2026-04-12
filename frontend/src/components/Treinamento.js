export default function Treinamento() {
  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Treinamentos LGPD</h2>
      </div>

      <div className="alert-info mb-24">
        <strong>Modulo em breve.</strong> Estamos trabalhando para disponibilizar
        a plataforma de treinamentos LGPD com trilhas, avaliacoes e certificados.
      </div>

      <div className="card mb-16">
        <h2 className="card-header">O que vai ter</h2>
        <div className="grid-2">
          <div>
            <div className="detail-label">Trilhas</div>
            <div className="detail-value">
              Cursos organizados por tema e perfil — introducao a LGPD, tratamento
              de dados, resposta a incidentes, direitos do titular, e modulos
              especificos para DPO, gestores e operadores.
            </div>
          </div>
          <div>
            <div className="detail-label">Avaliacoes</div>
            <div className="detail-value">
              Questionarios ao final de cada modulo com feedback imediato.
              Acompanhamento de progresso por usuario e relatorios agregados
              por organizacao.
            </div>
          </div>
          <div>
            <div className="detail-label">Certificados</div>
            <div className="detail-value">
              Geracao automatica de certificados PDF apos conclusao da trilha,
              com hash de integridade para auditoria.
            </div>
          </div>
          <div>
            <div className="detail-label">Capacitacao de equipe</div>
            <div className="detail-value">
              Dashboard do gestor para acompanhar o progresso da equipe e
              identificar usuarios pendentes de treinamento obrigatorio (GOV-05
              do checklist de conformidade).
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="card-header">Fundamentacao</h2>
        <p className="text-muted">
          A LGPD, no seu Art. 50, inciso I, alinea g, prevê a capacitacao
          periodica dos colaboradores que realizam o tratamento de dados pessoais
          como parte das boas praticas de governanca de dados.
        </p>
        <div className="mt-16">
          <span className="badge-legal">LGPD Art. 50, I, g</span>
        </div>
      </div>
    </div>
  );
}

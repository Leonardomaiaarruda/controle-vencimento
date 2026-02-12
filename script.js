// --- CONFIGURAÇÃO ---
let dadosFuncionarios = [];
let ordemAtual = "nome";
let dicionarioPrazos = {};

// URL FINAL DE EXECUÇÃO
const URL_APPS_SCRIPT = 'https://script.google.com/macros/s/AKfycbx74sxwu0jInttyN2-OlqbU0jM3NABVfm5FMy86ekb7JIweBdJr8Kmx6Lp56KV85Zn4dw/exec';

// --- INICIALIZAÇÃO ---
window.onload = function() {
    carregarDadosNuvem();
};

// --- NAVEGAÇÃO ---
function trocarTela(id) {
    document.querySelectorAll('.tela').forEach(t => t.style.display = 'none');
    const telaAlvo = document.getElementById(id);
    if (telaAlvo) telaAlvo.style.display = 'block';
    fecharModal();
}

function fecharModal() {
    const modal = document.getElementById('modalEdicao');
    if (modal) modal.style.display = 'none';
}

window.onclick = function(event) {
    const modal = document.getElementById('modalEdicao');
    if (event.target == modal) fecharModal();
}

// --- COMUNICAÇÃO COM A NUVEM ---
async function carregarDadosNuvem() {
    try {
        console.log("Sincronizando...");
        const response = await fetch(URL_APPS_SCRIPT, { method: 'GET', redirect: 'follow' });
        const data = await response.json();

        // 1. MAPEIA OS PRAZOS (Coluna J e K)
        dicionarioPrazos = {};
        data.prazos.forEach(par => {
            if (par[0]) {
                const nomeDoc = par[0].toString().trim().toUpperCase();
                dicionarioPrazos[nomeDoc] = parseInt(par[1]) || 0;
            }
        });

        // 2. MAPEIA OS FUNCIONÁRIOS EXATAMENTE COMO NA PLANILHA
        dadosFuncionarios = data.funcionarios.map(row => ({
            nome: row[0] || "",
            documento: row[1] || "",
            renovacao: formatarValorData(row[2]),
            vencimento: formatarValorData(row[3]), // Traz a data real da planilha
            status: row[4] || ""
        })).filter(f => f.nome);

        renderizarTabelas();
        console.log("Dados carregados com sucesso!");
    } catch (err) {
        console.error("Erro no carregamento:", err);
    }
}

// Auxiliar para tratar datas vindas do Google Sheets
function formatarValorData(valor) {
    if (!valor) return "";
    if (valor instanceof Date) return valor.toLocaleDateString('pt-BR');
    // Se já for string no formato ISO, tenta converter
    if (typeof valor === "string" && valor.includes("-") && !valor.includes("/")) {
        const d = new Date(valor);
        return !isNaN(d.getTime()) ? d.toLocaleDateString('pt-BR') : valor;
    }
    return valor.toString();
}

function calcularNovoVencimento(dataString, tipoDoc) {
    if (!dataString) return "";
    const diasValidade = dicionarioPrazos[tipoDoc.trim().toUpperCase()];
    if (!diasValidade) return dataString; 

    try {
        const partes = dataString.split('/');
        const data = new Date(partes[2], partes[1] - 1, partes[0]);
        data.setDate(data.getDate() + diasValidade);
        
        return `${String(data.getDate()).padStart(2, '0')}/${String(data.getMonth() + 1).padStart(2, '0')}/${data.getFullYear()}`;
    } catch (e) {
        return dataString;
    }
}

async function salvarEdicao() {
    const i = document.getElementById('editIndex').value;
    const nome = document.getElementById('editNome').value;
    const doc = document.getElementById('editDoc').value;
    const dataInput = document.getElementById('editVenc').value; // AAAA-MM-DD

    if (dataInput) {
        // 1. Converte data para formato BR
        const partes = dataInput.split('-');
        const novaRenovacao = `${partes[2]}/${partes[1]}/${partes[0]}`;
        
        // 2. Cálculo do vencimento (usando suas regras)
        const prazos = { "ASO": 365, "NR-18": 365, "NR-35": 730, "NR-12": 365, "VAC. ANT TETANICA": 3650, "NR-06": 365 };
        const dias = prazos[doc.trim().toUpperCase()] || 0;

        let novoVenc = novaRenovacao;
        if (dias > 0) {
            let dBase = new Date(partes[0], partes[1] - 1, partes[2]);
            dBase.setDate(dBase.getDate() + dias);
            novoVenc = `${String(dBase.getDate()).padStart(2, '0')}/${String(dBase.getMonth() + 1).padStart(2, '0')}/${dBase.getFullYear()}`;
        }

        // 3. Atualiza o item na lista local
        dadosFuncionarios[i].nome = nome;
        dadosFuncionarios[i].documento = doc;
        dadosFuncionarios[i].renovacao = novaRenovacao;
        dadosFuncionarios[i].vencimento = novoVenc;

        // 4. MANDA PARA A PLANILHA (Sincroniza a edição)
        await enviarParaNuvemSilencioso();
        
        renderizarTabelas();
        fecharModal();
    }
}

// Função auxiliar para salvar sem precisar clicar no botão "Salvar na Nuvem" toda hora
async function enviarParaNuvemSilencioso() {
    if (!dadosFuncionarios || dadosFuncionarios.length === 0) return;

    try {
        await fetch(URL_APPS_SCRIPT, {
            method: 'POST',
            mode: 'no-cors',
            cache: 'no-cache',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dadosFuncionarios)
        });
        console.log("Planilha sincronizada.");
    } catch (error) {
        console.error("Erro ao sincronizar:", error);
    }
}


// --- LÓGICA DE TABELAS ---
function renderizarTabelas(filtroNome = "") {
    const tGeral = document.querySelector('#tabelaGeral tbody');
    const tVencidos = document.querySelector('#tabelaVencidos tbody');
    const tAlerta = document.querySelector('#tabelaAlerta tbody');
    
    if (!tGeral) return;
    tGeral.innerHTML = tVencidos.innerHTML = tAlerta.innerHTML = "";

    const hoje = new Date();
    hoje.setHours(0,0,0,0);
    const limiteAlerta = new Date();
    limiteAlerta.setDate(hoje.getDate() + 30);

    dadosFuncionarios.forEach((f, index) => {
        if (filtroNome && !f.nome.toLowerCase().includes(filtroNome)) return;

        // Converte DD/MM/AAAA para objeto Date para comparação
        const partes = f.vencimento.split('/');
        const dVenc = new Date(partes[2], partes[1] - 1, partes[0]);
        
        const ehVencido = dVenc < hoje;
        const estaEmAlerta = dVenc >= hoje && dVenc <= limiteAlerta;

        const tr = `<tr>
            <td>${f.nome}</td>
            <td>${f.documento}</td>
            <td>${f.renovacao}</td>
            <td>${f.vencimento}</td>
            <td class="${ehVencido ? 'vencido' : (estaEmAlerta ? 'alerta' : 'em-dia')}">
                ${ehVencido ? 'Vencido' : (estaEmAlerta ? '⚠️ Próximo' : 'Em dia')}
            </td>
            <td><button onclick="editar(${index})">✏️</button> <button onclick="excluir(${index})">🗑️</button></td>
        </tr>`;
        
        tGeral.innerHTML += tr;
        if (ehVencido) tVencidos.innerHTML += tr;
        else if (estaEmAlerta) tAlerta.innerHTML += tr;
    });
    atualizarResumo();
}

function atualizarResumo() {
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const limite = new Date(); limite.setDate(hoje.getDate() + 30);
    let v = 0, a = 0;

    dadosFuncionarios.forEach(f => {
        const partes = f.vencimento.split('/');
        const d = new Date(partes[2], partes[1] - 1, partes[0]);
        if (d < hoje) v++; else if (d <= limite) a++;
    });

    document.getElementById('countTotal').innerText = dadosFuncionarios.length;
    document.getElementById('countVencidos').innerText = v;
    document.getElementById('countAlerta').innerText = a;
}

function editar(index) {
    const f = dadosFuncionarios[index];
    document.getElementById('editIndex').value = index;
    document.getElementById('editNome').value = f.nome;
    document.getElementById('editDoc').value = f.documento;
    
    if (f.renovacao && f.renovacao.includes('/')) {
        const partes = f.renovacao.split('/');
        document.getElementById('editVenc').value = `${partes[2]}-${partes[1]}-${partes[0]}`;
    }
    document.getElementById('modalEdicao').style.display = 'flex';
}

async function salvarNaNuvem() {
    // 1. TRAVA DE SEGURANÇA: Impede apagar a planilha se a lista estiver vazia por erro
    if (!dadosFuncionarios || dadosFuncionarios.length === 0) {
        alert("ERRO: A lista de funcionários está vazia no sistema. Para sua segurança, o salvamento foi bloqueado para não apagar a planilha. Recarregue a página (F5) e tente novamente.");
        return;
    }

    if (!confirm("Deseja salvar as alterações na planilha online? Isso atualizará as colunas de C até F.")) return;

    try {
        // Garante que o status visual e os cálculos internos estejam sincronizados antes de enviar
        renderizarTabelas(); 

        console.log("Enviando dados para a nuvem:", dadosFuncionarios);

        // Exibe um alerta visual ou log de carregamento (opcional)
        console.log("Iniciando processo de gravação no Google Sheets...");

        await fetch(URL_APPS_SCRIPT, {
            method: 'POST',
            mode: 'no-cors', 
            cache: 'no-cache',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dadosFuncionarios) 
        });

        alert("Sucesso! Os dados (incluindo exclusões se houver) foram enviados. Aguarde a sincronização automática...");

        // Aguardamos 4 segundos para dar tempo ao Google de:
        // 1. Limpar a planilha (clearContent)
        // 2. Gravar os novos dados (setValues)
        setTimeout(() => {
            console.log("Sincronizando sistema com a planilha atualizada...");
            carregarDadosNuvem();
        }, 4000); 

    } catch (error) {
        console.error("Erro crítico ao salvar:", error);
        alert("Ocorreu um erro de conexão. Verifique se você está online e se a URL do script está correta.");
    }
}

async function excluir(index) {
    if (confirm(`Tem certeza que deseja excluir ${dadosFuncionarios[index].nome}?`)) {
        // Remove do array local
        dadosFuncionarios.splice(index, 1);
        
        // Renderiza a tabela novamente para o usuário ver que sumiu
        renderizarTabelas();
        
        // Avisa que vai sincronizar a exclusão com a planilha
        console.log("Sincronizando exclusão com a planilha...");
        
        try {
            await fetch(URL_APPS_SCRIPT, {
                method: 'POST',
                mode: 'no-cors',
                cache: 'no-cache',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dadosFuncionarios)
            });
            alert("Registro excluído com sucesso na planilha!");
        } catch (error) {
            alert("Erro ao excluir na planilha. Tente salvar manualmente.");
        }
    }
}

function filtrarPorNome() {
    const busca = document.getElementById('inputBusca');
    if (busca) renderizarTabelas(busca.value.toLowerCase());
}


async function adicionarNovo() {
    const nome = document.getElementById('novoNome').value.trim();
    const doc = document.getElementById('novoDoc').value;
    const dataInput = document.getElementById('novaDataRenovacao').value;

    // Validação simples
    if (!nome || !doc || !dataInput) {
        alert("Por favor, preencha o Nome, o Documento e a Data de Renovação.");
        return;
    }

    // 1. Formata a data de Renovação para DD/MM/AAAA
    const partes = dataInput.split('-'); // AAAA-MM-DD
    const dataBr = `${partes[2]}/${partes[1]}/${partes[0]}`;

    // 2. Calcula o Vencimento com base nas regras que você já usa
    const prazos = { 
        "ASO": 365, "NR-18": 365, "NR-35": 730, "NR-12": 365, 
        "VAC. ANT TETANICA": 3650, "NR-06": 365 
    };
    
    const dias = prazos[doc] || 0;
    let vencimentoCalculado = dataBr;

    if (dias > 0) {
        let dBase = new Date(partes[0], partes[1] - 1, partes[2]);
        dBase.setDate(dBase.getDate() + dias);
        const diaV = String(dBase.getDate()).padStart(2, '0');
        const mesV = String(dBase.getMonth() + 1).padStart(2, '0');
        vencimentoCalculado = `${diaV}/${mesV}/${dBase.getFullYear()}`;
    }

    // 3. Cria o novo objeto
    const novoFuncionario = {
        nome: nome.toUpperCase(),
        documento: doc,
        renovacao: dataBr,
        vencimento: vencimentoCalculado
    };

    // 4. Adiciona à lista atual (dadosFuncionarios)
    dadosFuncionarios.push(novoFuncionario);

    // 5. Salva na Planilha e atualiza a tela
    renderizarTabelas(); // Atualiza a visão na hora
    
    // Limpa os campos do formulário
    document.getElementById('novoNome').value = "";
    document.getElementById('novaDataRenovacao').value = "";
    document.getElementById('novoDoc').value = "";

    // Chama sua função de salvar que já está pronta e funcionando!
    await salvarNaNuvem(); 
}

function alternarFormularioCadastro() {
    const form = document.getElementById('container-cadastro');
    const btn = document.getElementById('btnAbrirCadastro');
    
    if (form.style.display === 'none') {
        form.style.display = 'block';
        btn.innerText = '✖ Fechar Cadastro';
        btn.style.background = '#dc3545'; // Fica vermelho quando aberto
    } else {
        form.style.display = 'none';
        btn.innerText = '+ Novo Cadastro';
        btn.style.background = '#007bff'; // Volta para azul quando fechado
    }
}

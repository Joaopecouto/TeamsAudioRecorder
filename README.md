# Gravador de Reunião → MP3 (v0.7)

Extensão Chrome (Manifest V3) que grava o áudio de **uma aba do navegador**
(Teams/Meet no navegador) e exporta um **MP3 leve** (mono, 16 kHz) para você jogar
no Gemini e pedir o resumo.

**Tudo roda local.** Nenhum áudio sai da máquina: gravação e conversão para MP3
(via `lamejs`, embutido em `lib/lame.min.js`) acontecem dentro da extensão.

## Novidades da v0.7
- **Permissão do microfone na instalação**: ao instalar, abre a página já pedindo o mic.
- **Aviso sonoro + 1 piscada** no lembrete ao entrar na reunião (toggle pra desligar).
- **Seções separadas** em Ajustes (Captura · Resumo com IA · Arquivo · Lembrete) — menos carga cognitiva.
- **Edge cases**: transcrever/resumir sem chave leva ao campo da chave; microfone com
  fallback pro padrão se o aparelho sumir; aviso de gravação vazia; histórico mostra banner se faltar chave.

## Novidades da v0.6
- **Página própria** (abre em aba): saiu do popup. Abas **Ajustes** e **Gravações**.
- **Idioma do resumo/tarefas**: "natural da reunião" ou "sempre em português" (muda o prompt).
- Botões **Transcrever** e **Criar resumo** por gravação — geram **só ao clicar**.
- Áudios guardados localmente (IndexedDB, últimas 12) p/ transcrever/resumir depois.
- "Resumo automático ao parar" agora vem **desligado** por padrão.
- O popup ficou enxuto: status, botão grande, microfone e link "Ver gravações".

## Novidades da v0.5
- **Resumo com IA direto na extensão** (Gemini, BYOK): o usuário cola a própria chave
  gratuita do Google AI Studio (fica no `chrome.storage.local`, só na máquina). O áudio
  vai direto pra **API oficial do Gemini** e o resumo aparece na aba Gravações
  (ver / copiar / baixar `.md`).
- **Resumo automático ao parar** (liga/desliga em Ajustes).
- Sem "bypass" de assinatura: API oficial + chave do próprio usuário, dentro das regras.

## Novidades da v0.4
- **Fonte do áudio selecionável**: "Aba do navegador" (`tabCapture`) ou "Sistema inteiro"
  (`desktopCapture` — cobre o Teams **app desktop**, não só o navegador).
- **Seletor de microfone**: escolhe qual aparelho usar (lista via `enumerateDevices`).
- **Configurações em abas**: "Gravação" (fonte, microfone, qualidade, arquivo, pasta, lembrete)
  e "Gravações" (histórico real dos MP3 com abrir / mostrar na pasta).

## Novidades da v0.3
- **Microfone + áudio da reunião** mixados na mesma gravação (Web Audio). O mic não
  volta pro alto-falante (sem eco); a reunião continua audível.
- **Nome do arquivo com formato de data personalizável** (tokens `AAAA/AA/MM/DD/hh/mm/ss`)
  + **prévia ao vivo** do nome final.
- **Configurações em modal** dentro do popup — não abre outra página.
- **Botão grande** de iniciar gravação.

## Novidades da v0.2
- **Pill flutuante** no Meet/Teams: lembra de gravar e permite iniciar/parar na própria página.
- **Badge "REC"** no ícone da barra enquanto grava.
- **Página de configurações**: qualidade, pasta de destino, "perguntar onde salvar", prefixo do arquivo, lembrete e cantos.
- **UI** no design system do João (matiz teal/petrol, vermelho complementar, radii 8/24, sombra de 5 camadas).
- **Ícones** próprios (16/32/48/128).

---

## ⚠️ Antes de tudo — checagem de 30 segundos (notebook da empresa)

A extensão se instala via "Carregar sem compactação" (modo desenvolvedor), e não
pela Chrome Web Store. Isso costuma ser permitido mesmo onde a TI bloqueia `.exe`,
mas algumas políticas travam. Verifique:

1. Abra `chrome://extensions`
2. Ligue **"Modo do desenvolvedor"** (canto superior direito)
3. Veja se aparece **"Carregar sem compactação"**

Bloqueado pela organização → nenhuma extensão própria roda nesse Chrome.

---

## Instalar
1. `chrome://extensions` → **Modo do desenvolvedor** ligado.
2. **Carregar sem compactação** → selecione esta pasta (`TeamsAudioRecorder`).
3. Fixe o ícone na barra.

## Usar
1. Entre na reunião pelo **navegador** (Teams ou Meet).
2. O **pill** aparece no canto lembrando de gravar — clique **Gravar** (ou use o ícone da extensão).
3. Para encerrar, clique **Parar** no pill (ou no popup). O `.mp3` cai em **Downloads/Reuniões**.
4. Suba o MP3 no Gemini com o prompt sugerido abaixo.

## Configurações (ícone ⚙ no popup)
- **Qualidade**: 24 / 32 / 48 kbps (mono 16 kHz).
- **Pasta de destino**: subpasta dentro de Downloads.
- **Perguntar onde salvar**: abre "Salvar como" para escolher qualquer pasta.
- **Prefixo do arquivo**, **lembrete on/off**, **canto** e **em quais sites** (Teams/Meet).

> Limite do Chrome (honesto): sem perguntar, o navegador só salva **dentro de Downloads**
> (dá pra escolher a subpasta). Para uma pasta arbitrária fixa do PC, use "Perguntar onde
> salvar" — pasta-fixa-externa silenciosa exigiria a File System Access API (roadmap).

## Prompt sugerido no Gemini
> Transcreva e resuma este áudio de reunião em português. Entregue: 1) Resumo
> executivo (3–5 linhas); 2) Decisões; 3) Itens de ação (tarefa | responsável | prazo);
> 4) Pontos em aberto/riscos; 5) Próximos passos. Não invente nada que não esteja no
> áudio; se algo não foi dito, escreva "—".

---

## Status / o que ainda não foi testado ao vivo
v0.2 montada, **não testada contra Teams/Meet real nem Chrome gerenciado**. Pontos a
confirmar no primeiro uso (veja `chrome://extensions` > Erros e o console em
"Inspecionar visualizações: offscreen.html"):

- `tabCapture` capturando a aba (a partir do popup **e** do pill).
- Início pelo **pill** (sem o gesto do popup) — se o `getMediaStreamId` reclamar de
  gesto, o pill cai no aviso "use o ícone da extensão"; o popup é o caminho garantido.
- `decodeAudioData` lendo o `webm/opus`. Se a conversão falhar, troca-se para captura
  de PCM ao vivo (AudioWorklet) em vez de decodificar depois.
- Seletores de detecção do pill: hoje ele aparece em qualquer página dos domínios; a
  detecção fina de "em chamada" é heurística e pode ser refinada.

## Limitações conhecidas
- **Fonte do áudio**: "Aba" (silencioso) ou "Sistema inteiro" (abre o seletor do Chrome;
  escolha "Tela inteira" + "compartilhar áudio do sistema" — cobre o Teams app desktop).
  O modo Sistema via `desktopCapture` ainda precisa de validação ao vivo (ver Status).
- **Microfone**: a permissão precisa ser concedida numa tela visível (o offscreen é
  invisível e não pode pedir). Por isso o toggle do mic fica **no popup** e dispara o
  pedido uma vez; depois o offscreen usa direto. Se faltar permissão na hora, grava só
  a reunião e avisa. Use **fones** para o mic não captar o eco da reunião.
- **Resumo (Gemini)**: o áudio é enviado "inline", o que limita a ~14 MB por gravação
  (cerca de 1–2 h no bitrate padrão). Acima disso, reduza o bitrate — suporte a arquivos
  grandes (Gemini File API) fica pro roadmap. A chave do usuário não deve ter restrição de
  referrer/IP que bloqueie a extensão. Modelo padrão `gemini-2.5-flash` (trocável em Ajustes).
- Sem diarização (quem fala) — o Gemini infere na transcrição.

## Roadmap
- v0.3: modo "áudio do sistema" (`desktopCapture`) p/ cobrir o app desktop.
- v0.3: pausar/retomar, e detecção de chamada mais precisa por plataforma.
- v0.4: pasta fixa externa via File System Access API.

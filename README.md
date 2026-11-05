<h1 align="center">Gravador de Reunião</h1>

<p align="center">Extensão Chrome (Manifest V3) que grava reuniões do Google Meet e do Microsoft Teams, transcreve e resume.<br><sub><i>Chrome extension (Manifest V3) that records, transcribes and summarizes Google Meet and Microsoft Teams meetings.</i></sub></p>

<p align="center">
  <kbd><img src="https://raw.githubusercontent.com/Joaopecouto/Joaopecouto/main/assets/icons/googlechrome.svg" height="15" alt=""> Manifest V3</kbd> <kbd><img src="https://raw.githubusercontent.com/Joaopecouto/Joaopecouto/main/assets/icons/javascript.svg" height="15" alt=""> JavaScript</kbd> <kbd><img src="https://raw.githubusercontent.com/Joaopecouto/Joaopecouto/main/assets/icons/googlegemini.svg" height="15" alt=""> Gemini API</kbd>
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/gravador-de-reuni%C3%A3o-%E2%86%92-mp3/oblcnhlpjjipaodcifnignjfdbgmmkdg?hl=pt-br"><kbd><img src="https://raw.githubusercontent.com/Joaopecouto/Joaopecouto/main/assets/icons/googlechrome.svg" height="15" alt=""> Instalar pela Chrome Web Store</kbd></a>
  <a href="https://chromewebstore.google.com/detail/gravador-de-reuni%C3%A3o-%E2%86%92-mp3/oblcnhlpjjipaodcifnignjfdbgmmkdg?hl=en"><kbd><img src="https://raw.githubusercontent.com/Joaopecouto/Joaopecouto/main/assets/icons/googlechrome.svg" height="15" alt=""> Install from the Chrome Web Store</kbd></a>
</p>

## Português

Grava o áudio do sistema e o microfone em **MP3 leve**, captura a **transcrição oficial silenciosa com identificação de quem fala** (Google Meet e Microsoft Teams), exporta em **.mp3**, **.vtt** e **.txt** e gera o **resumo executivo no Gemini** em cerca de 4 segundos.

**Tudo roda localmente.** Nenhum áudio sai da máquina para servidores de terceiros, não há bot entrando na sala e as legendas não aparecem na tela.

### Funcionalidades

- **Identificação de quem fala:** os nomes dos participantes vêm do mecanismo de legendas nativo do Meet e do Teams.
- **Sem poluição visual:** as legendas ficam ocultas na tela enquanto a captura segue ativa em segundo plano.
- **Exportação em .vtt e .txt** com carimbos de tempo e falantes, além do **.mp3**.
- **Resumo com o Gemini** a partir da transcrição, com tarefas atribuídas às pessoas certas. Você usa a própria chave gratuita do Google AI Studio, guardada só na máquina.
- **Fallback automático:** onde as legendas estiverem indisponíveis, a transcrição por áudio pelo Gemini continua funcionando.
- **Microfone e áudio da reunião** na mesma gravação, com nome de arquivo configurável, pasta de destino e lembrete ao entrar na reunião.
- Interface em português e inglês, com aviso sonoro opcional e histórico das gravações.

### Como usar

1. Instale pela [Chrome Web Store](https://chromewebstore.google.com/detail/gravador-de-reuni%C3%A3o-%E2%86%92-mp3/oblcnhlpjjipaodcifnignjfdbgmmkdg?hl=pt-br) e fixe o ícone na barra.
2. Entre na reunião pelo navegador (Meet ou Teams) e conceda a permissão do microfone na primeira vez.
3. Clique em **Gravar** no lembrete da página ou no ícone da extensão, e em **Parar** ao final.
4. Abra a página de gravações para ver, copiar ou baixar a transcrição e o resumo.

### Instalar o código-fonte

`chrome://extensions`, ligue o **Modo do desenvolvedor**, clique em **Carregar sem compactação** e selecione esta pasta.

### Limites conhecidos

- A permissão do microfone precisa ser concedida numa tela visível; use fones para o microfone não captar o eco da reunião.
- No caminho de transcrição por áudio, o Gemini recebe o arquivo inline, o que limita a cerca de 14 MB por gravação; acima disso, reduza o bitrate.
- Sem chave do Gemini, a extensão grava e exporta normalmente, mas não gera resumo.

## English

Records system audio and the microphone into a **lightweight MP3**, captures the **official silent transcript with speaker identification** (Google Meet and Microsoft Teams), exports **.mp3**, **.vtt** and **.txt**, and produces an **executive summary with Gemini** in about 4 seconds.

**Everything runs locally.** No audio leaves your machine for third-party servers, no bot joins the room and captions are not shown on screen.

### Features

- **Speaker identification:** participant names come from the native caption engine of Meet and Teams.
- **No visual clutter:** captions stay hidden on screen while capture keeps running in the background.
- **.vtt and .txt export** with timestamps and speakers, besides the **.mp3**.
- **Gemini summary** built from the transcript, with action items assigned to the right people. You use your own free Google AI Studio key, stored only on your machine.
- **Automatic fallback:** where captions are unavailable, audio transcription through Gemini keeps working.
- **Microphone and meeting audio** in the same recording, with a configurable file name, destination folder and a reminder when you join a meeting.
- Portuguese and English interface, an optional sound alert and a recording history.

### How to use

1. Install it from the [Chrome Web Store](https://chromewebstore.google.com/detail/gravador-de-reuni%C3%A3o-%E2%86%92-mp3/oblcnhlpjjipaodcifnignjfdbgmmkdg?hl=en) and pin the icon.
2. Join the meeting in the browser (Meet or Teams) and grant the microphone permission the first time.
3. Click **Record** on the page reminder or on the extension icon, and **Stop** at the end.
4. Open the recordings page to view, copy or download the transcript and the summary.

### Install from source

`chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and select this folder.

### Known limits

- The microphone permission must be granted on a visible page; use headphones so the microphone does not pick up meeting echo.
- On the audio transcription path, Gemini receives the file inline, which caps a recording at about 14 MB; above that, lower the bitrate.
- Without a Gemini key, the extension still records and exports, but it does not generate a summary.

<sub>Contato · Contact: <a href="https://joaocouto.alcetus.com">joaocouto.alcetus.com</a> · <a href="mailto:joaopecouto77@gmail.com">joaopecouto77@gmail.com</a></sub>

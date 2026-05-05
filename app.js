const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const app = express();

const ytDlp = require('youtube-dl-exec');

app.set('view engine', 'ejs');
app.use('/assets', express.static(path.join(__dirname, 'assets')));

function normalizarUrl(url) {
    try {
        const u = new URL(url);

        if (u.hostname.includes('youtube.com')) {
            const id = u.searchParams.get('v');
            if (id) return `https://www.youtube.com/watch?v=${id}`;
        }

        if (u.hostname === 'youtu.be') {
            return `https://www.youtube.com/watch?v=${u.pathname.replace('/', '')}`;
        }

        return url;
    } catch {
        return url;
    }
}

app.get('/info', async (req, res) => {
    const { url } = req.query;
    const dirPath = path.join(__dirname, 'assets/wallpapers');
    
    try {
        const cleanUrl = normalizarUrl(url);
        const info = await ytDlp(cleanUrl, { dumpSingleJson: true, noWarnings: true });
        
        const files = await fs.readdir(dirPath);
        const wallpapers = files.filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
        const bg = `/assets/wallpapers/${wallpapers[Math.floor(Math.random() * wallpapers.length)]}`;

        const formatsRaw = info.formats
            .filter(f => {
                if (f.format_note === 'storyboard') return false;
                if (f.ext === 'mhtml') return false;
                if (f.vcodec === 'none' && f.acodec === 'none') return false;
                return true;
            })
            .map(f => ({
                id: f.format_id,
                ext: (f.vcodec === 'none' && f.acodec !== 'none') ? 'mp3' : f.ext,
                quality: f.format_note || f.resolution || 'desconhecido',
                type:
                    f.vcodec !== 'none' && f.acodec !== 'none' ? 'video+audio' :
                    f.vcodec !== 'none' ? 'video' :
                    'audio',
                bitrate: f.abr || 0
            }));

        const vistos = new Set();
        const videos = formatsRaw
            .filter(f => f.type !== 'audio')
            .filter(f => {
                const chave = `${f.quality}_${f.ext}`;
                if (vistos.has(chave)) return false;
                vistos.add(chave);
                return true;
            });

        const bestAudio = formatsRaw
            .filter(f => f.type === 'audio')
            .sort((a, b) => b.bitrate - a.bitrate)[0];

        const videoData = {
            title: info.title,
            thumbnail: info.thumbnail,
            url: cleanUrl,
            formats: [...videos, ...(bestAudio ? [bestAudio] : [])]
        };

        res.render('app', { bg, videoInfo: videoData });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.get('/download', (req, res) => {
    const { url, id, type, name, ext } = req.query;

    const cleanUrl = normalizarUrl(url);

    let args = {
        output: '-'
    };

    if (type === 'audio') {
        args.format = 'bestaudio';
        args.extractAudio = true;
        args.audioFormat = 'mp3';
        res.header('Content-Disposition', `attachment; filename="${name || 'audio'}.mp3"`);
    } else {
        args.format = id || 'bestvideo+bestaudio/best';
        args.mergeOutputFormat = 'mp4';
        res.header('Content-Disposition', `attachment; filename="${name || 'video'}.mp4"`);
    }

    const dlp = ytDlp.exec(cleanUrl, args);

    dlp.stdout.pipe(res);
    dlp.on('error', () => res.status(500).end());
});

app.get('/listar-formatos', async (req, res) => {
    const { url } = req.query;

    try {
        const cleanUrl = normalizarUrl(url);
        const info = await ytDlp(cleanUrl, {
            dumpSingleJson: true,
            noWarnings: true
        });

        const formatos = info.formats.map(f => ({
            id: f.format_id,
            extensao: f.ext,
            resolucao: f.resolution || 'áudio',
            fps: f.fps,
            vcodec: f.vcodec,
            acodec: f.acodec,
            tamanho: f.filesize ? (f.filesize / 1024 / 1024).toFixed(2) + ' MB' : 'N/A'
        }));

        res.json({
            titulo: info.title,
            disponiveis: formatos
        });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

app.get('/', async (req, res) => {
    const dirPath = path.join(__dirname, 'assets/wallpapers');
    
    try {
        const files = await fs.readdir(dirPath);
        const wallpapers = files.filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
        
        const sorteado = wallpapers.length > 0 
            ? `/assets/wallpapers/${wallpapers[Math.floor(Math.random() * wallpapers.length)]}` 
            : 'https://i.redd.it/qoon2h51tnab1.png';

        res.render('app', { bg: sorteado });
    } catch (err) {
        res.render('app', { bg: 'https://i.redd.it/qoon2h51tnab1.png' });
    }
});

app.listen(3000);
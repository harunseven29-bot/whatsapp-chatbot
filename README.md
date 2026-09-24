# Neon Arcade

Dört klasik salon oyunu, tarayıcıda, sıfır bağımlılıkla.

| Oyun | Dosya | Kontroller |
|------|-------|------------|
| Yılan | `games/snake.html` | Oklar / WASD, kaydırma |
| Tuğla Kırıcı | `games/breakout.html` | ← → / fare / dokunma, Boşluk fırlatır |
| Asteroit | `games/asteroids.html` | ← → döner, ↑ itki, Boşluk ateş |
| Blok Yağmuru | `games/blocks.html` | ← → ↓, ↑/X/Z döndür, Boşluk düşür, C sakla |

Her oyunda `P` duraklatır, `M` sesi kapatır. Rekorlar `localStorage`'da tutulur.

## Çalıştırma

```bash
npx serve .          # ya da: python3 -m http.server
# http://localhost:3000 (veya :8000) adresini aç
```

`index.html` dosyasını doğrudan tarayıcıda açmak da çalışır.

## Test

```bash
node tools/smoke.mjs          # tüm oyunlar + başlatıcı
node tools/smoke.mjs snake    # tek oyun
```

Smoke test her oyunu headless Chromium'da masaüstü (1280 px) ve telefon (360 px) genişliğinde açar,
konsol hatası olmadığını, `window.__arcade` kancasını, Boşluk ile başlamayı, `P` ile duraklamayı ve
yatay taşma olmadığını kontrol eder.

## Nasıl yapıldı

Bu repo bir alt ajan (subagent) iş akışıyla üretildi:

1. **Skill**: `.claude/skills/add-game/SKILL.md`, her oyunun uyması gereken sözleşmeyi tanımlar
   (kontroller, durumlar, palet, test kancası).
2. **Test**: `tools/smoke.mjs` bu sözleşmeyi otomatik doğrular.
3. **Alt ajanlar**: Dört oyun, dört paralel alt ajan tarafından aynı anda yazıldı
   (`.claude/agents/game-builder.md`). Her ajan yalnızca kendi dosyasına dokundu ve smoke test
   geçene kadar yineledi.
4. **Orkestratör**: Başlatıcıyı yazdı, sonuçları birleştirdi, tüm testi çalıştırıp commit'ledi.

Yeni oyun eklemek için Claude Code'da: *"add-game skill'ini kullanarak Pong ekle"*.

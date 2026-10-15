# Isso é bom ou ruim?

[![Deploy](https://github.com/gomesar9/baralho-do-posicionamento/actions/workflows/deploy.yml/badge.svg)](https://github.com/gomesar9/baralho-do-posicionamento/actions/workflows/deploy.yml)

Versão digital do baralho político "Isso é bom ou ruim?". São 32 cartas com frases: você lê cada uma, decide se acha boa ou ruim e só depois a carta vira e mostra qual dos dois políticos fez ou defende aquilo, com link para a fonte.

Jogue em **[baralhodaverdade.org](https://baralhodaverdade.org)**. Para imprimir o baralho, use o `Baralho.pdf`.

## Como executar

O site é estático (HTML, CSS e JavaScript puro), sem build nem dependências. Basta abrir o `index.html` no navegador. Se preferir um servidor local:

```sh
python3 -m http.server 8000   # depois acesse http://localhost:8000
```

## Como contribuir com cartas novas

### Regras

- **Sempre duas cartas, uma de cada candidato.** Para o baralho continuar equilibrado, toda sugestão traz um par: uma carta do LULA e uma do FLÁVIO BOLSONARO, de preferência sobre o mesmo tema. Sugestão de carta avulsa não é aceita.
- **Comece por uma issue.** Antes de qualquer pull request, abra uma issue com o modelo [Sugestão de par de cartas](https://github.com/gomesar9/baralho-do-posicionamento/issues/new?template=sugestao-de-carta.yml). Um par por issue.
- **Fonte obrigatória e verificável, para cada carta.** O link deve mostrar o próprio candidato dizendo, propondo ou defendendo aquilo: vídeo, documento oficial, plano de governo, rede social oficial ou reportagem de veículo reconhecido. Informe data e contexto (e o minuto, se for vídeo).
- **Frase fiel e sem pistas.** O jogo depende de julgar sem saber de quem é. Nada de nomes, partidos, apelidos ou adjetivos que entreguem o autor, e nada que distorça o sentido original.
- **Sem repetição.** Confira se já não existe carta igual ou parecida no baralho ou em outra issue.
- **Pull request só depois da issue aprovada**, citando a issue na descrição (ex.: `Closes #12`).

### Adicionar o par aprovado

1. Adicione as duas cartas ao fim da lista `cartas` em `cards.json`, uma de cada candidato:

   ```json
   {
     "numero": 33,
     "rotulo": "33",
     "naipe": "copas",
     "frase": "Texto da frase, sem aspas no começo e no fim.",
     "hashtag": "#tema",
     "politico": "LULA",
     "fonteUrl": "https://link-para-a-fonte"
   }
   ```

   - `numero`: os próximos números livres, um para cada carta. `rotulo` é o que aparece no canto da carta.
   - `naipe`: `copas`, `espadas`, `ouros` ou `paus`. Siga o baralho: copas e espadas para LULA, ouros e paus para FLÁVIO BOLSONARO.
   - `politico`: escrito exatamente como nas outras cartas, para entrar certo no resumo.
   - `hashtag`: minúsculas e sem acento. Repita um tema existente sempre que possível.
   - `fonteUrl`: obrigatória. É o link de onde a frase foi tirada.

2. Gere o `cards.js` de novo:

   ```sh
   ./preparar-public.sh --sem-deploy
   ```

3. Abra o `index.html`, ache as duas cartas no leque e confira o texto e o link "Ver a fonte" de cada uma.
4. Abra um pull request com o `cards.json` e o `cards.js`.

Com cartas novas, o progresso salvo no navegador de quem já jogou recomeça do zero.

## Créditos e agradecimentos

O baralho (frases, arte e PDF) foi criado pelo coletivo **Do Baralho** ([@nossobaralho](https://www.instagram.com/nossobaralho/) no Instagram). Muito obrigado ao coletivo por criar o jogo e compartilhá-lo livremente. Este site só existe por causa desse trabalho.

Obrigado também a **Rebeca Duarte** ([@enfrebeca](https://www.instagram.com/enfrebeca/) no Instagram), que divulgou o baralho, foi por onde fiquei sabendo dele.

## Licença

[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/deed.pt-br) — Creative Commons Atribuição-NãoComercial 4.0 Internacional. Você pode copiar, distribuir, adaptar e imprimir, desde que dê crédito ao coletivo Do Baralho (@nossobaralho) e não use para fins comerciais. Texto completo em [`LICENSE`](LICENSE).

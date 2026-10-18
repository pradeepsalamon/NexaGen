// Chess-legend stories for the "Chess Legends" interactive — short enough for a
// class break, true enough for a lesson. Ids are persisted (LEGENDS.storyId).

export type LegendStory = {
  id: string;
  title: string;
  /** Who / where / when, one line. */
  subtitle: string;
  emoji: string;
  minutes: number;
  paragraphs: string[];
  /** The takeaway for the class. */
  lesson: string;
};

export const LEGEND_STORIES: LegendStory[] = [
  {
    id: "immortal-game",
    title: "The Immortal Game",
    subtitle: "Adolf Anderssen vs Lionel Kieseritzky — London, 1851",
    emoji: "👑",
    minutes: 3,
    paragraphs: [
      "In 1851, during a break at the first big international tournament in London, Adolf Anderssen sat down for a friendly game against Lionel Kieseritzky.",
      "Anderssen began giving away his pieces. First a bishop, then both of his rooks — and finally his queen! Kieseritzky took everything he was offered.",
      "But every capture pulled Black's pieces away from the king. With only a few minor pieces left, Anderssen delivered checkmate. The game was so beautiful that people called it 'Immortal'.",
    ],
    lesson:
      "Material is not everything — activity and king safety can be worth more than a queen.",
  },
  {
    id: "opera-game",
    title: "The Opera Game",
    subtitle:
      "Paul Morphy vs the Duke of Brunswick and Count Isouard — Paris, 1858",
    emoji: "🎭",
    minutes: 3,
    paragraphs: [
      "Paul Morphy was invited to the opera in Paris. Instead of watching the show, two noblemen challenged him to a game in their private box — playing together as a team.",
      "Morphy developed a new piece almost every move, while his opponents moved the same pieces again and again. Soon every one of his pieces was aimed at the black king.",
      "In just 17 moves he sacrificed his queen and finished with a checkmate by a rook. The game is still the most famous lesson in fast development.",
    ],
    lesson:
      "Develop your pieces quickly, open lines toward the enemy king, and don't move the same piece twice without a reason.",
  },
  {
    id: "capablanca-age-four",
    title: "The Four-Year-Old Who Spotted a Mistake",
    subtitle: "José Raúl Capablanca — Havana, around 1892",
    emoji: "🧒",
    minutes: 2,
    paragraphs: [
      "Little José Raúl Capablanca loved watching his father play chess. Nobody had taught him the rules — he simply watched.",
      "One day his father moved a knight illegally. The four-year-old pointed it out. His father laughed, until José set up the pieces and beat him!",
      "That boy grew up to become the third World Champion, famous for making difficult positions look simple.",
    ],
    lesson:
      "Watching carefully is a skill. Strong players notice details others miss.",
  },
  {
    id: "game-of-the-century",
    title: "The Game of the Century",
    subtitle: "Donald Byrne vs Bobby Fischer — New York, 1956",
    emoji: "🌟",
    minutes: 3,
    paragraphs: [
      "Bobby Fischer was just 13 when he faced Donald Byrne, one of the strongest players in the United States.",
      "In the middle of the game Fischer left his queen to be captured. It looked like a blunder — but it was a plan. In return his pieces swarmed the white king and won a huge amount of material.",
      "A chess magazine called it 'The Game of the Century'. Fifteen years later Fischer became World Champion.",
    ],
    lesson:
      "Calculate! A sacrifice is a good idea only when you can see what you get back.",
  },
  {
    id: "magician-from-riga",
    title: "The Magician from Riga",
    subtitle: "Mikhail Tal — World Champion, 1960",
    emoji: "🪄",
    minutes: 2,
    paragraphs: [
      "Mikhail Tal from Riga, Latvia, played like a magician: he sacrificed pieces in positions where nobody else would dare.",
      "His opponents spent hours trying to prove his sacrifices were wrong — and often ran out of time or made mistakes in the complications.",
      "In 1960, aged 23, he beat the great Mikhail Botvinnik to become the youngest World Champion of his time.",
    ],
    lesson:
      "Courage and imagination are chess skills too — but always check what your opponent can do back.",
  },
  {
    id: "menchik",
    title: "Vera Menchik, the Trailblazer",
    subtitle: "First Women's World Champion — 1927",
    emoji: "🏆",
    minutes: 2,
    paragraphs: [
      "In 1927 Vera Menchik won the very first Women's World Championship. She kept the title for 17 years.",
      "She also played in the strongest men's tournaments and beat several famous grandmasters. Her victims were jokingly said to join the 'Menchik Club'.",
      "Today the Women's Chess Olympiad trophy carries her name: the Vera Menchik Cup.",
    ],
    lesson:
      "Break barriers. The board doesn't care who you are — only how well you play.",
  },
  {
    id: "judit-polgar",
    title: "Judit Polgár Breaks the Record",
    subtitle: "Budapest, 1991",
    emoji: "🚀",
    minutes: 2,
    paragraphs: [
      "Judit Polgár and her two sisters grew up studying chess every day in Budapest.",
      "In 1991, at 15 years and 4 months, Judit became a grandmaster — younger than Bobby Fischer had been.",
      "She chose to compete against the best players in the world, men included, and defeated many World Champions, among them Garry Kasparov.",
    ],
    lesson:
      "Daily practice compounds. Aim for the strongest opponents you can find.",
  },
  {
    id: "lightning-kid",
    title: "The Lightning Kid",
    subtitle: "Viswanathan Anand — India's first grandmaster, 1988",
    emoji: "⚡",
    minutes: 2,
    paragraphs: [
      "Viswanathan Anand from Chennai played so fast as a young player that he was nicknamed 'The Lightning Kid'.",
      "In 1988 he became India's first grandmaster. Later he won the World Championship and held the undisputed title from 2007 to 2013.",
      "His success inspired thousands of young Indian players — many of today's top grandmasters grew up watching 'Vishy'.",
    ],
    lesson:
      "Trust your intuition, and remember that one person's success can inspire a whole country.",
  },
  {
    id: "deep-blue",
    title: "Man vs Machine",
    subtitle: "Garry Kasparov vs Deep Blue — New York, 1997",
    emoji: "🤖",
    minutes: 3,
    paragraphs: [
      "In 1996 World Champion Garry Kasparov played a match against IBM's computer, Deep Blue — and won.",
      "A year later they met again. This time Deep Blue won the six-game match, the first time a computer had beaten a reigning World Champion in a match.",
      "Today engines are far stronger than any human, and players use them every day as training partners.",
    ],
    lesson:
      "Engines are tools for learning. Use them to check your ideas — after you have thought for yourself.",
  },
  {
    id: "gukesh",
    title: "The Youngest World Champion",
    subtitle: "Gukesh Dommaraju vs Ding Liren — Singapore, 2024",
    emoji: "🇮🇳",
    minutes: 2,
    paragraphs: [
      "Gukesh Dommaraju from Chennai started playing chess at seven and became a grandmaster at 12.",
      "In 2024 he won the Candidates tournament to earn a World Championship match against Ding Liren.",
      "The match went down to the final game. Gukesh won it and became, at 18, the youngest undisputed World Champion in history.",
    ],
    lesson:
      "Keep fighting until the very last move — games are often decided at the end.",
  },
];

const BY_ID = new Map(LEGEND_STORIES.map((s) => [s.id, s]));
export const legendById = (id: string | null) =>
  id ? (BY_ID.get(id) ?? null) : null;

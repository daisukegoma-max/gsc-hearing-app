import './globals.css'

export const metadata = {
  title: 'GSC対話型ヒアリング',
  description: 'グローバルスタートアップキャンパス構想 - 研究者向け対話型ヒアリングシステム',
}

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  )
}

<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:sitemap="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xhtml="http://www.w3.org/1999/xhtml">

  <xsl:output method="html" encoding="UTF-8" indent="yes"/>

  <xsl:template match="sitemap:urlset">
    <html xmlns="http://www.w3.org/1999/xhtml" lang="en">
      <head>
        <title>PeteZah Sitemap</title>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <link rel="icon" type="image/png" href="/storage/images/favicon-96x96.png" sizes="96x96" />
        <link rel="icon" type="image/svg+xml" href="/storage/images/favicon.svg" />
        <link rel="shortcut icon" href="/storage/images/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/storage/images/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-title" content="PeteZah" />
        <link rel="manifest" href="/storage/images/site.webmanifest" />
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&amp;display=swap');
          body {
            font-family: 'Poppins', sans-serif;
            background: #04041d;
            color: #fff;
            margin: 2rem;
          }
          h1 {
            color: #b0c4ff;
            margin-bottom: 1rem;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            background: #151a2d;
            border: 1px solid white;
            border-radius: 8px;
            overflow: hidden;
          }
          th, td {
            padding: 0.75rem;
            border-bottom: 1px solid rgba(255,255,255,0.2);
            text-align: left;
          }
          th {
            background: #151a2d;
            color: #b0c4ff;
          }
          tr:nth-child(even) {
            background: rgba(255,255,255,0.05);
          }
          tr:hover {
            background: #dde4fb;
            color: #151a2d;
          }
          a {
            color: #b0c4ff;
            text-decoration: none;
          }
          a:hover {
            text-decoration: underline;
            color: #6c8bdc;
          }
          .meta {
            font-size: 0.9rem;
            margin-bottom: 1rem;
            color: #a8b2d1;
          }
        </style>
      </head>
      <body>
        <h1>XML Sitemap</h1>
        <p class="meta">This sitemap contains <xsl:value-of select="count(sitemap:url)"/> URLs.</p>
        <table>
          <thead>
            <tr>
              <th>URL</th>
              <th>Priority</th>
              <th>Change Frequency</th>
              <th>Last Modified</th>
            </tr>
          </thead>
          <tbody>
            <xsl:for-each select="sitemap:url">
              <tr>
                <td><a href="{sitemap:loc}"><xsl:value-of select="sitemap:loc"/></a></td>
                <td>
                  <xsl:choose>
                    <xsl:when test="normalize-space(sitemap:priority)">
                      <xsl:value-of select="sitemap:priority"/>
                    </xsl:when>
                    <xsl:otherwise>N/A</xsl:otherwise>
                  </xsl:choose>
                </td>
                <td>
                  <xsl:choose>
                    <xsl:when test="normalize-space(sitemap:changefreq)">
                      <xsl:value-of select="sitemap:changefreq"/>
                    </xsl:when>
                    <xsl:otherwise>Unknown</xsl:otherwise>
                  </xsl:choose>
                </td>
                <td>
                  <xsl:choose>
                    <xsl:when test="string-length(sitemap:lastmod) &gt; 0">
                      <xsl:value-of select="substring(sitemap:lastmod,1,10)" />
                    </xsl:when>
                    <xsl:otherwise>N/A</xsl:otherwise>
                  </xsl:choose>
                </td>
              </tr>
            </xsl:for-each>
          </tbody>
          <tfoot>
            <tr>
              <td colspan="4">Total URLs: <xsl:value-of select="count(sitemap:url)"/></td>
            </tr>
          </tfoot>
        </table>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>

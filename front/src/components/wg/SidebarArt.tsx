"use client";

/**
 * Decorative sidebar artwork: wheat leaves showing three common diseases
 *   - Yellow rust    (rows of yellow-orange pustules on the left leaf)
 *   - Powdery mildew (soft white patches at the base of the left leaf)
 *   - Septoria blotch (tan lesions with dark specks on the right leaf)
 * behind a large, transparent "shield + wheat ear" emblem watermark.
 *
 * Pure inline SVG: no image file, no network. Colors for the watermark are set
 * in ./sidebar.css (.wg-art-logo) so it adapts to light/dark mode.
 * `idSuffix` keeps gradient/filter ids unique when the sidebar is rendered
 * twice (desktop rail + mobile drawer).
 */
export function SidebarArt({ idSuffix = "d" }: { idSuffix?: string }) {
  const s = idSuffix;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 264 440" preserveAspectRatio="xMidYMid slice" fill="none" aria-hidden="true" focusable="false">
<defs>
<filter id="mildew-${s}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6"/></filter>
<linearGradient id="leafA-${s}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#2f8a57"/><stop offset="1" stop-color="#58b27a"/></linearGradient>
<linearGradient id="leafB-${s}" x1="1" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#2a7d50"/><stop offset="1" stop-color="#4fa56f"/></linearGradient>
</defs>
<g class="wg-art-logo" fill="currentColor">
<path d="M132 130 L196 152 C196 215 178 262 132 295 C86 262 68 215 68 152 Z" fill="none" stroke="currentColor" stroke-width="6" stroke-linejoin="round"/>
<path d="M132 142 L184 160 C184 211 169 249 132 276 C95 249 80 211 80 160 Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-opacity=".7"/>
<rect x="130.5" y="176" width="3" height="104" rx="1.5"/>
<ellipse cx="132" cy="168" rx="6.5" ry="11"/>
<ellipse cx="123.5" cy="186" rx="6" ry="11.5" transform="rotate(-30 123.5 186)"/>
<ellipse cx="140.5" cy="186" rx="6" ry="11.5" transform="rotate(30 140.5 186)"/>
<ellipse cx="123.5" cy="201" rx="6" ry="11.5" transform="rotate(-30 123.5 201)"/>
<ellipse cx="140.5" cy="201" rx="6" ry="11.5" transform="rotate(30 140.5 201)"/>
<ellipse cx="123.5" cy="216" rx="6" ry="11.5" transform="rotate(-30 123.5 216)"/>
<ellipse cx="140.5" cy="216" rx="6" ry="11.5" transform="rotate(30 140.5 216)"/>
<ellipse cx="123.5" cy="231" rx="6" ry="11.5" transform="rotate(-30 123.5 231)"/>
<ellipse cx="140.5" cy="231" rx="6" ry="11.5" transform="rotate(30 140.5 231)"/>
<ellipse cx="123.5" cy="246" rx="6" ry="11.5" transform="rotate(-30 123.5 246)"/>
<ellipse cx="140.5" cy="246" rx="6" ry="11.5" transform="rotate(30 140.5 246)"/>
<ellipse cx="123.5" cy="261" rx="6" ry="11.5" transform="rotate(-30 123.5 261)"/>
<ellipse cx="140.5" cy="261" rx="6" ry="11.5" transform="rotate(30 140.5 261)"/>
</g>
<g class="wg-art-leaf"><path d="M122.2 445.5 L123.5 442.1 L124.8 438.7 L126.1 435.4 L127.4 432.2 L127.9 429.1 L127.8 426.1 L127.6 423.1 L127.5 420.1 L127.5 417.2 L127.5 414.3 L127.5 411.4 L127.6 408.6 L127.7 405.8 L127.8 403.0 L128.0 400.2 L128.2 397.4 L128.5 394.7 L128.8 392.0 L129.2 389.3 L129.6 386.7 L130.0 384.1 L130.5 381.4 L131.0 378.8 L131.6 376.3 L132.2 373.7 L132.9 371.1 L133.6 368.6 L134.4 366.1 L135.2 363.6 L136.0 361.1 L136.9 358.6 L137.9 356.2 L138.9 353.7 L139.9 351.3 L141.0 348.8 L142.2 346.4 L143.4 344.0 L144.6 341.6 L145.9 339.3 L147.3 336.9 L148.7 334.5 L150.2 332.2 L151.7 329.8 L153.3 327.5 L155.0 325.2 L156.7 322.9 L158.5 320.6 L160.3 318.3 L159.7 317.7 L157.4 319.5 L155.0 321.2 L152.7 323.1 L150.5 324.9 L148.3 326.8 L146.2 328.8 L144.1 330.8 L142.0 332.8 L140.0 334.9 L138.1 337.0 L136.2 339.2 L134.3 341.4 L132.5 343.6 L130.8 345.9 L129.1 348.3 L127.5 350.6 L125.9 353.1 L124.4 355.5 L122.9 358.1 L121.5 360.6 L120.1 363.2 L118.8 365.8 L117.6 368.5 L116.4 371.2 L115.3 374.0 L114.2 376.8 L113.2 379.6 L112.2 382.5 L111.4 385.4 L110.5 388.4 L109.8 391.4 L109.1 394.4 L108.5 397.5 L107.9 400.6 L107.4 403.7 L106.9 406.9 L106.5 410.1 L106.2 413.3 L106.0 416.6 L105.8 419.8 L105.7 423.2 L105.6 426.5 L105.6 429.9 L106.4 433.3 L108.1 436.6 L110.0 439.9 L111.8 443.2 L113.8 446.5 Z" fill="url(#leafB-${s})"/><path d="M118.0 446.0 L117.7 442.6 L117.4 439.3 L117.1 436.0 L116.9 432.7 L116.8 429.5 L116.7 426.3 L116.7 423.1 L116.7 420.0 L116.7 416.9 L116.9 413.8 L117.0 410.7 L117.2 407.7 L117.5 404.7 L117.9 401.8 L118.2 398.8 L118.7 395.9 L119.2 393.1 L119.7 390.2 L120.3 387.4 L120.9 384.6 L121.6 381.8 L122.4 379.1 L123.2 376.4 L124.0 373.8 L124.9 371.1 L125.9 368.5 L126.9 365.9 L127.9 363.4 L129.0 360.8 L130.2 358.3 L131.4 355.9 L132.7 353.4 L134.0 351.0 L135.4 348.6 L136.8 346.2 L138.2 343.9 L139.8 341.6 L141.4 339.3 L143.0 337.1 L144.7 334.8 L146.4 332.6 L148.2 330.5 L150.0 328.3 L151.9 326.2 L153.9 324.1 L155.9 322.1 L157.9 320.0 L160.0 318.0" stroke="#bfe8cf" stroke-opacity=".55" stroke-width="1.2" stroke-linecap="round"/></g>
<g class="wg-art-leaf"><path d="M267.5 444.8 L268.6 439.6 L269.6 434.4 L270.4 429.2 L271.2 424.0 L270.7 419.1 L269.1 414.6 L267.5 410.1 L265.8 405.6 L264.1 401.2 L262.2 396.9 L260.3 392.6 L258.3 388.4 L256.3 384.2 L254.1 380.1 L251.9 376.1 L249.6 372.1 L247.2 368.2 L244.8 364.4 L242.3 360.6 L239.7 356.9 L237.1 353.2 L234.4 349.6 L231.6 346.1 L228.7 342.7 L225.8 339.3 L222.8 336.0 L219.8 332.7 L216.7 329.6 L213.5 326.5 L210.2 323.5 L206.9 320.5 L203.6 317.6 L200.2 314.8 L196.7 312.1 L193.1 309.4 L189.5 306.9 L185.9 304.4 L182.2 301.9 L178.4 299.6 L174.6 297.3 L170.7 295.1 L166.8 292.9 L162.8 290.9 L158.8 288.9 L154.7 287.0 L150.6 285.1 L146.4 283.3 L142.2 281.6 L141.8 282.4 L145.5 285.0 L149.2 287.6 L152.7 290.3 L156.2 293.0 L159.6 295.8 L162.9 298.6 L166.2 301.5 L169.4 304.4 L172.5 307.3 L175.6 310.2 L178.5 313.2 L181.5 316.3 L184.3 319.3 L187.1 322.4 L189.8 325.6 L192.4 328.7 L195.0 331.9 L197.5 335.2 L200.0 338.5 L202.3 341.8 L204.7 345.1 L206.9 348.5 L209.1 351.9 L211.3 355.3 L213.4 358.8 L215.4 362.3 L217.4 365.9 L219.3 369.5 L221.1 373.1 L222.9 376.8 L224.7 380.5 L226.4 384.2 L228.0 388.0 L229.6 391.8 L231.2 395.6 L232.7 399.5 L234.1 403.4 L235.5 407.4 L236.9 411.4 L238.2 415.4 L239.4 419.5 L240.6 423.6 L241.8 427.8 L243.8 431.7 L247.0 435.4 L250.2 439.2 L253.3 443.2 L256.5 447.2 Z" fill="url(#leafB-${s})"/><path d="M262.0 446.0 L261.0 441.4 L259.9 436.8 L258.7 432.3 L257.5 427.9 L256.2 423.5 L254.9 419.1 L253.5 414.8 L252.0 410.5 L250.5 406.3 L248.9 402.1 L247.2 398.0 L245.5 393.9 L243.7 389.9 L241.9 385.9 L240.0 382.0 L238.0 378.1 L236.0 374.3 L233.9 370.6 L231.7 366.8 L229.5 363.2 L227.2 359.5 L224.9 356.0 L222.5 352.5 L220.0 349.0 L217.5 345.6 L214.9 342.2 L212.2 338.9 L209.5 335.7 L206.7 332.5 L203.9 329.3 L201.0 326.2 L198.0 323.2 L195.0 320.2 L191.9 317.3 L188.7 314.4 L185.5 311.6 L182.2 308.8 L178.9 306.1 L175.5 303.4 L172.0 300.8 L168.5 298.3 L164.9 295.8 L161.2 293.3 L157.5 291.0 L153.7 288.6 L149.9 286.4 L146.0 284.2 L142.0 282.0" stroke="#bfe8cf" stroke-opacity=".55" stroke-width="1.2" stroke-linecap="round"/></g>
<g class="wg-art-leaf"><path d="M28.7 448.2 L33.3 443.3 L37.9 438.4 L42.5 433.7 L47.1 429.1 L50.4 424.1 L52.5 418.7 L54.6 413.3 L56.9 408.0 L59.1 402.8 L61.4 397.6 L63.8 392.5 L66.2 387.4 L68.7 382.3 L71.3 377.4 L73.9 372.4 L76.5 367.5 L79.3 362.6 L82.1 357.8 L84.9 353.0 L87.9 348.3 L90.9 343.6 L94.0 338.9 L97.2 334.3 L100.4 329.7 L103.7 325.1 L107.1 320.6 L110.6 316.0 L114.2 311.5 L117.9 307.1 L121.6 302.6 L125.5 298.2 L129.4 293.8 L133.5 289.5 L137.6 285.1 L141.8 280.8 L146.2 276.5 L150.6 272.2 L155.1 268.0 L159.7 263.7 L164.5 259.5 L169.3 255.3 L174.3 251.1 L179.3 246.9 L184.5 242.8 L189.7 238.7 L195.1 234.5 L200.6 230.4 L206.2 226.3 L205.8 225.7 L199.5 228.6 L193.3 231.6 L187.2 234.6 L181.2 237.7 L175.3 240.9 L169.4 244.1 L163.7 247.3 L158.0 250.7 L152.5 254.0 L147.0 257.5 L141.6 260.9 L136.3 264.5 L131.1 268.1 L126.0 271.8 L121.0 275.5 L116.0 279.4 L111.2 283.2 L106.4 287.2 L101.7 291.2 L97.1 295.3 L92.6 299.4 L88.2 303.7 L83.8 308.0 L79.6 312.3 L75.4 316.8 L71.3 321.3 L67.3 325.9 L63.4 330.5 L59.6 335.3 L55.9 340.1 L52.2 345.0 L48.7 350.0 L45.2 355.0 L41.8 360.1 L38.5 365.3 L35.3 370.6 L32.2 376.0 L29.1 381.4 L26.2 386.9 L23.3 392.5 L20.5 398.1 L17.8 403.9 L15.2 409.7 L13.9 416.0 L14.0 422.9 L14.3 429.9 L14.8 436.8 L15.3 443.8 Z" fill="url(#leafA-${s})"/><path d="M22.0 446.0 L24.0 440.0 L26.1 434.1 L28.3 428.3 L30.5 422.6 L32.8 416.9 L35.2 411.3 L37.6 405.7 L40.1 400.3 L42.6 394.8 L45.3 389.5 L48.0 384.2 L50.8 379.0 L53.6 373.8 L56.5 368.7 L59.5 363.7 L62.6 358.7 L65.7 353.8 L69.0 349.0 L72.3 344.2 L75.7 339.4 L79.1 334.7 L82.7 330.1 L86.3 325.5 L90.0 321.0 L93.8 316.5 L97.7 312.1 L101.6 307.7 L105.7 303.4 L109.8 299.1 L114.0 294.9 L118.3 290.7 L122.7 286.6 L127.2 282.5 L131.8 278.5 L136.5 274.5 L141.2 270.5 L146.1 266.6 L151.1 262.7 L156.1 258.9 L161.3 255.1 L166.5 251.3 L171.8 247.6 L177.3 243.9 L182.8 240.3 L188.5 236.6 L194.2 233.1 L200.1 229.5 L206.0 226.0" stroke="#bfe8cf" stroke-opacity=".55" stroke-width="1.2" stroke-linecap="round"/></g>
<g>
<ellipse cx="35.4" cy="387.3" rx="2.1" ry="1.05" fill="#e9a925" transform="rotate(-64 35.4 387.3)"/>
<ellipse cx="41.5" cy="376.2" rx="2.1" ry="1.05" fill="#e9a925" transform="rotate(-62 41.5 376.2)"/>
<ellipse cx="47.3" cy="366.2" rx="2.1" ry="1.05" fill="#f2c230" transform="rotate(-60 47.3 366.2)"/>
<ellipse cx="53.8" cy="356.0" rx="2.1" ry="1.05" fill="#f2c230" transform="rotate(-58 53.8 356.0)"/>
<ellipse cx="59.7" cy="347.4" rx="2.1" ry="1.05" fill="#f2c230" transform="rotate(-57 59.7 347.4)"/>
<ellipse cx="67.0" cy="337.5" rx="2.1" ry="1.05" fill="#f2c230" transform="rotate(-55 67.0 337.5)"/>
<ellipse cx="72.7" cy="330.2" rx="2.1" ry="1.05" fill="#e9a925" transform="rotate(-53 72.7 330.2)"/>
<ellipse cx="79.5" cy="322.0" rx="2.1" ry="1.05" fill="#f2c230" transform="rotate(-51 79.5 322.0)"/>
<ellipse cx="85.8" cy="314.9" rx="2.1" ry="1.05" fill="#e9a925" transform="rotate(-50 85.8 314.9)"/>
<ellipse cx="92.2" cy="308.0" rx="2.1" ry="1.05" fill="#f6d24a" transform="rotate(-48 92.2 308.0)"/>
<ellipse cx="99.0" cy="301.2" rx="2.1" ry="1.05" fill="#f2c230" transform="rotate(-47 99.0 301.2)"/>
<ellipse cx="107.3" cy="293.2" rx="2.1" ry="1.05" fill="#f6d24a" transform="rotate(-45 107.3 293.2)"/>
<ellipse cx="116.8" cy="284.8" rx="2.1" ry="1.05" fill="#f6d24a" transform="rotate(-43 116.8 284.8)"/>
<ellipse cx="125.7" cy="277.4" rx="2.1" ry="1.05" fill="#f2c230" transform="rotate(-42 125.7 277.4)"/>
<ellipse cx="136.0" cy="269.4" rx="2.1" ry="1.05" fill="#f2c230" transform="rotate(-40 136.0 269.4)"/>
<ellipse cx="145.4" cy="262.5" rx="2.1" ry="1.05" fill="#f2c230" transform="rotate(-38 145.4 262.5)"/>
<ellipse cx="154.4" cy="256.3" rx="2.1" ry="1.05" fill="#f2c230" transform="rotate(-37 154.4 256.3)"/>
<ellipse cx="164.4" cy="249.8" rx="2.1" ry="1.05" fill="#f6d24a" transform="rotate(-35 164.4 249.8)"/>
<ellipse cx="41.0" cy="390.1" rx="2.1" ry="1.05" fill="#f6d24a" transform="rotate(-64 41.0 390.1)"/>
<ellipse cx="45.6" cy="381.3" rx="2.1" ry="1.05" fill="#f6d24a" transform="rotate(-62 45.6 381.3)"/>
<ellipse cx="51.0" cy="371.6" rx="2.1" ry="1.05" fill="#f2c230" transform="rotate(-61 51.0 371.6)"/>
<ellipse cx="56.3" cy="362.7" rx="2.1" ry="1.05" fill="#f6d24a" transform="rotate(-59 56.3 362.7)"/>
<ellipse cx="62.5" cy="353.1" rx="2.1" ry="1.05" fill="#f6d24a" transform="rotate(-57 62.5 353.1)"/>
<ellipse cx="67.7" cy="345.4" rx="2.1" ry="1.05" fill="#f2c230" transform="rotate(-56 67.7 345.4)"/>
<ellipse cx="74.0" cy="336.8" rx="2.1" ry="1.05" fill="#f6d24a" transform="rotate(-54 74.0 336.8)"/>
<ellipse cx="80.4" cy="328.5" rx="2.1" ry="1.05" fill="#e9a925" transform="rotate(-52 80.4 328.5)"/>
<ellipse cx="87.1" cy="320.3" rx="2.1" ry="1.05" fill="#e9a925" transform="rotate(-50 87.1 320.3)"/>
<ellipse cx="93.9" cy="312.5" rx="2.1" ry="1.05" fill="#f2c230" transform="rotate(-49 93.9 312.5)"/>
<ellipse cx="102.0" cy="303.9" rx="2.1" ry="1.05" fill="#f6d24a" transform="rotate(-47 102.0 303.9)"/>
<ellipse cx="110.4" cy="295.5" rx="2.1" ry="1.05" fill="#f2c230" transform="rotate(-45 110.4 295.5)"/>
<ellipse cx="118.6" cy="287.8" rx="2.1" ry="1.05" fill="#f6d24a" transform="rotate(-43 118.6 287.8)"/>
<ellipse cx="126.9" cy="280.4" rx="2.1" ry="1.05" fill="#e9a925" transform="rotate(-42 126.9 280.4)"/>
<ellipse cx="136.2" cy="272.7" rx="2.1" ry="1.05" fill="#e9a925" transform="rotate(-40 136.2 272.7)"/>
<ellipse cx="145.4" cy="265.4" rx="2.1" ry="1.05" fill="#f2c230" transform="rotate(-38 145.4 265.4)"/>
<ellipse cx="153.6" cy="259.3" rx="2.1" ry="1.05" fill="#e9a925" transform="rotate(-37 153.6 259.3)"/>
<ellipse cx="162.1" cy="253.3" rx="2.1" ry="1.05" fill="#e9a925" transform="rotate(-36 162.1 253.3)"/>
<ellipse cx="47.4" cy="393.2" rx="2.1" ry="1.05" fill="#e9a925" transform="rotate(-64 47.4 393.2)"/>
<ellipse cx="52.1" cy="383.9" rx="2.1" ry="1.05" fill="#f6d24a" transform="rotate(-62 52.1 383.9)"/>
<ellipse cx="56.4" cy="375.7" rx="2.1" ry="1.05" fill="#f6d24a" transform="rotate(-61 56.4 375.7)"/>
<ellipse cx="61.8" cy="366.3" rx="2.1" ry="1.05" fill="#e9a925" transform="rotate(-59 61.8 366.3)"/>
<ellipse cx="67.0" cy="357.7" rx="2.1" ry="1.05" fill="#e9a925" transform="rotate(-57 67.0 357.7)"/>
<ellipse cx="72.9" cy="348.6" rx="2.1" ry="1.05" fill="#f6d24a" transform="rotate(-56 72.9 348.6)"/>
<ellipse cx="79.5" cy="339.1" rx="2.1" ry="1.05" fill="#f2c230" transform="rotate(-54 79.5 339.1)"/>
<ellipse cx="86.5" cy="329.7" rx="2.1" ry="1.05" fill="#e9a925" transform="rotate(-52 86.5 329.7)"/>
<ellipse cx="93.0" cy="321.5" rx="2.1" ry="1.05" fill="#f6d24a" transform="rotate(-50 93.0 321.5)"/>
<ellipse cx="98.9" cy="314.5" rx="2.1" ry="1.05" fill="#f6d24a" transform="rotate(-48 98.9 314.5)"/>
<ellipse cx="106.4" cy="306.0" rx="2.1" ry="1.05" fill="#f6d24a" transform="rotate(-47 106.4 306.0)"/>
<ellipse cx="114.0" cy="297.9" rx="2.1" ry="1.05" fill="#f6d24a" transform="rotate(-45 114.0 297.9)"/>
<ellipse cx="122.5" cy="289.4" rx="2.1" ry="1.05" fill="#e9a925" transform="rotate(-43 122.5 289.4)"/>
<ellipse cx="131.1" cy="281.4" rx="2.1" ry="1.05" fill="#f6d24a" transform="rotate(-41 131.1 281.4)"/>
<ellipse cx="139.1" cy="274.3" rx="2.1" ry="1.05" fill="#e9a925" transform="rotate(-40 139.1 274.3)"/>
<ellipse cx="147.3" cy="267.3" rx="2.1" ry="1.05" fill="#f6d24a" transform="rotate(-38 147.3 267.3)"/>
<ellipse cx="155.2" cy="261.0" rx="2.1" ry="1.05" fill="#f2c230" transform="rotate(-37 155.2 261.0)"/>
<ellipse cx="163.6" cy="254.6" rx="2.1" ry="1.05" fill="#e9a925" transform="rotate(-36 163.6 254.6)"/>
<ellipse cx="53.0" cy="396.0" rx="2.1" ry="1.05" fill="#f2c230" transform="rotate(-64 53.0 396.0)"/>
<ellipse cx="57.4" cy="386.8" rx="2.1" ry="1.05" fill="#e9a925" transform="rotate(-62 57.4 386.8)"/>
<ellipse cx="61.6" cy="378.7" rx="2.1" ry="1.05" fill="#e9a925" transform="rotate(-61 61.6 378.7)"/>
<ellipse cx="66.4" cy="369.8" rx="2.1" ry="1.05" fill="#e9a925" transform="rotate(-59 66.4 369.8)"/>
<ellipse cx="72.3" cy="359.7" rx="2.1" ry="1.05" fill="#e9a925" transform="rotate(-57 72.3 359.7)"/>
<ellipse cx="78.4" cy="349.9" rx="2.1" ry="1.05" fill="#e9a925" transform="rotate(-55 78.4 349.9)"/>
<ellipse cx="84.6" cy="340.7" rx="2.1" ry="1.05" fill="#e9a925" transform="rotate(-53 84.6 340.7)"/>
<ellipse cx="91.0" cy="331.7" rx="2.1" ry="1.05" fill="#e9a925" transform="rotate(-51 91.0 331.7)"/>
<ellipse cx="98.2" cy="322.2" rx="2.1" ry="1.05" fill="#f2c230" transform="rotate(-49 98.2 322.2)"/>
<ellipse cx="104.0" cy="315.1" rx="2.1" ry="1.05" fill="#f2c230" transform="rotate(-48 104.0 315.1)"/>
<ellipse cx="110.2" cy="307.7" rx="2.1" ry="1.05" fill="#f2c230" transform="rotate(-46 110.2 307.7)"/>
<ellipse cx="116.3" cy="301.0" rx="2.1" ry="1.05" fill="#f6d24a" transform="rotate(-45 116.3 301.0)"/>
<ellipse cx="122.9" cy="293.9" rx="2.1" ry="1.05" fill="#e9a925" transform="rotate(-43 122.9 293.9)"/>
<ellipse cx="129.4" cy="287.3" rx="2.1" ry="1.05" fill="#e9a925" transform="rotate(-42 129.4 287.3)"/>
<ellipse cx="137.4" cy="279.6" rx="2.1" ry="1.05" fill="#f6d24a" transform="rotate(-41 137.4 279.6)"/>
<ellipse cx="145.8" cy="271.8" rx="2.1" ry="1.05" fill="#f2c230" transform="rotate(-39 145.8 271.8)"/>
<ellipse cx="154.9" cy="263.9" rx="2.1" ry="1.05" fill="#f6d24a" transform="rotate(-37 154.9 263.9)"/>
<ellipse cx="165.2" cy="255.5" rx="2.1" ry="1.05" fill="#f6d24a" transform="rotate(-36 165.2 255.5)"/>
</g>
<g filter="url(#mildew-${s})">
<circle cx="30.6" cy="426.8" r="7" fill="#f6faf5" fill-opacity=".92"/>
<circle cx="28.6" cy="410.1" r="6" fill="#f6faf5" fill-opacity=".92"/>
<circle cx="45.6" cy="408.0" r="5.5" fill="#f6faf5" fill-opacity=".92"/>
<circle cx="42.9" cy="394.2" r="4.5" fill="#f6faf5" fill-opacity=".92"/>
</g>
<g>
<ellipse cx="250.5" cy="398.8" rx="7.0" ry="3.8" fill="#e6d36a" fill-opacity=".55" transform="rotate(-112 250.5 398.8)"/>
<ellipse cx="250.5" cy="398.8" rx="5.0" ry="2.5" fill="#b98b4e" transform="rotate(-112 250.5 398.8)"/>
<circle cx="252.1" cy="401.0" r=".7" fill="#5a3b1d"/>
<circle cx="250.5" cy="397.0" r=".7" fill="#5a3b1d"/>
<circle cx="249.7" cy="397.2" r=".7" fill="#5a3b1d"/>
<circle cx="250.2" cy="399.6" r=".7" fill="#5a3b1d"/>
<ellipse cx="234.4" cy="380.8" rx="8.4" ry="4.6" fill="#e6d36a" fill-opacity=".55" transform="rotate(-117 234.4 380.8)"/>
<ellipse cx="234.4" cy="380.8" rx="6.0" ry="3.0" fill="#b98b4e" transform="rotate(-117 234.4 380.8)"/>
<circle cx="233.2" cy="380.3" r=".7" fill="#5a3b1d"/>
<circle cx="235.3" cy="383.8" r=".7" fill="#5a3b1d"/>
<circle cx="235.2" cy="383.1" r=".7" fill="#5a3b1d"/>
<circle cx="235.0" cy="384.1" r=".7" fill="#5a3b1d"/>
<ellipse cx="229.8" cy="357.3" rx="6.3" ry="3.4" fill="#e6d36a" fill-opacity=".55" transform="rotate(-123 229.8 357.3)"/>
<ellipse cx="229.8" cy="357.3" rx="4.5" ry="2.2" fill="#b98b4e" transform="rotate(-123 229.8 357.3)"/>
<circle cx="230.3" cy="359.2" r=".7" fill="#5a3b1d"/>
<circle cx="229.6" cy="358.3" r=".7" fill="#5a3b1d"/>
<circle cx="228.8" cy="355.5" r=".7" fill="#5a3b1d"/>
<circle cx="230.5" cy="359.1" r=".7" fill="#5a3b1d"/>
<ellipse cx="213.1" cy="341.5" rx="7.7" ry="4.2" fill="#e6d36a" fill-opacity=".55" transform="rotate(-129 213.1 341.5)"/>
<ellipse cx="213.1" cy="341.5" rx="5.5" ry="2.8" fill="#b98b4e" transform="rotate(-129 213.1 341.5)"/>
<circle cx="213.5" cy="342.4" r=".7" fill="#5a3b1d"/>
<circle cx="215.1" cy="343.1" r=".7" fill="#5a3b1d"/>
<circle cx="211.0" cy="339.0" r=".7" fill="#5a3b1d"/>
<circle cx="212.6" cy="342.0" r=".7" fill="#5a3b1d"/>
<ellipse cx="200.3" cy="322.8" rx="5.6" ry="3.0" fill="#e6d36a" fill-opacity=".55" transform="rotate(-135 200.3 322.8)"/>
<ellipse cx="200.3" cy="322.8" rx="4.0" ry="2.0" fill="#b98b4e" transform="rotate(-135 200.3 322.8)"/>
<circle cx="201.5" cy="324.3" r=".7" fill="#5a3b1d"/>
<circle cx="201.4" cy="323.3" r=".7" fill="#5a3b1d"/>
<circle cx="201.0" cy="324.4" r=".7" fill="#5a3b1d"/>
<circle cx="198.8" cy="321.3" r=".7" fill="#5a3b1d"/>
<ellipse cx="247.0" cy="381.5" rx="4.9" ry="2.7" fill="#e6d36a" fill-opacity=".55" transform="rotate(-116 247.0 381.5)"/>
<ellipse cx="247.0" cy="381.5" rx="3.5" ry="1.8" fill="#b98b4e" transform="rotate(-116 247.0 381.5)"/>
<circle cx="247.7" cy="382.8" r=".7" fill="#5a3b1d"/>
<circle cx="247.9" cy="383.3" r=".7" fill="#5a3b1d"/>
<circle cx="246.5" cy="379.5" r=".7" fill="#5a3b1d"/>
<circle cx="246.4" cy="380.9" r=".7" fill="#5a3b1d"/>
</g>
<ellipse cx="123.6" cy="380.6" rx="2" ry="1" fill="#f2c230" transform="rotate(-75 123.6 380.6)"/>
<ellipse cx="124.3" cy="366.7" rx="2" ry="1" fill="#f2c230" transform="rotate(-69 124.3 366.7)"/>
<ellipse cx="132.2" cy="355.6" rx="2" ry="1" fill="#f2c230" transform="rotate(-63 132.2 355.6)"/>
</svg>`;
  return (
    <div
      className="wg-sb-art pointer-events-none absolute inset-0 z-0"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

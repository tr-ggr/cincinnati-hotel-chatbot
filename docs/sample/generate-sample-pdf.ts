// Generates the sample hotel guide used to seed the chatbot.
// Run from the repo root: `pnpm sample:pdf` (tsx). Output: docs/sample/cincinnati-hotel.pdf
import { createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

const OUT = fileURLToPath(new URL('./cincinnati-hotel.pdf', import.meta.url));

type Block =
  | { kind: 'h1'; text: string }
  | { kind: 'h2'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'rows'; rows: [string, string][] }
  | { kind: 'break' };

const H = (text: string): Block => ({ kind: 'h1', text });
const S = (text: string): Block => ({ kind: 'h2', text });
const P = (text: string): Block => ({ kind: 'p', text });
const L = (items: string[]): Block => ({ kind: 'list', items });
const R = (rows: [string, string][]): Block => ({ kind: 'rows', rows });
const BREAK: Block = { kind: 'break' };

const content: Block[] = [
  // ---------------------------------------------------------------- Welcome
  H('Welcome to the Queen City Hotel'),
  P(
    'Welcome to the Queen City Hotel, a downtown Cincinnati landmark on the bank of the Ohio River. Our hotel has ' +
      'welcomed business travelers, wedding parties, families, and weekend explorers for more than a decade. This guide ' +
      'answers the questions we hear most often at the front desk, so that you can plan your stay with confidence before ' +
      'you arrive. Every section is written to be read on its own, and the index on the following pages will help you find ' +
      'the topic you need.'
  ),
  P(
    'Our team is available around the clock. The front desk is staffed twenty-four hours a day, seven days a week, and ' +
      'can be reached from any house phone by dialing zero, or from your mobile phone at the main reservations number. ' +
      'Our concierge desk in the main lobby is open from 7:00 AM to 10:00 PM and can help with restaurant reservations, ' +
      'tickets for local attractions, and private transportation.'
  ),
  S('Hotel at a glance'),
  R([
    ['Property type', 'Full-service downtown hotel'],
    ['Guest rooms', 'Standard, Deluxe and Riverside suite categories'],
    ['Restaurant', 'The Fountain Room'],
    ['Bar', 'Lobby Bar'],
    ['Pool', 'Rooftop pool'],
    ['Meeting space', 'Ohio Ballroom and four meeting rooms'],
    ['Wi-Fi', 'Free throughout the property'],
  ]),
  P(
    'Our hotel is a short walk from the Cincinnati riverfront, the historic Over-the-Rhine neighborhood and the main ' +
      'downtown shopping district. Guests who prefer to explore on foot will find that most attractions are within ' +
      'fifteen minutes, while the nearest stop for the city streetcar is just half a block from our main entrance.'
  ),
  S('Before you arrive'),
  P(
    'If you have a special request such as a crib, a late arrival, an accessible room, or a quiet room away from the ' +
      'elevators, please note it in your reservation or contact the reservations team. We will do our best to honor every ' +
      'request, although some requests cannot be guaranteed until you check in. Guests who are arriving by car should ' +
      'review the valet parking information in the Location & Transport section of this guide.'
  ),

  // ----------------------------------------------------------------- Rooms
  H('Rooms and Suites'),
  P(
    'Every guest room at the Queen City Hotel was renovated in 2023 and features a plush queen or king bed, blackout ' +
      'curtains, a wall-mounted sixty-five inch television with streaming applications, a work desk with ergonomic seating, ' +
      'and a rainfall shower in the bathroom. Rooms are cleaned daily, and fresh towels and linens are provided each day ' +
      'of your stay. Our housekeeping team can be reached from any house phone for additional amenities.'
  ),
  S('Standard King'),
  P(
    'The Standard King is our most popular room for solo business travelers and couples. It offers approximately three ' +
      'hundred square feet of space, a king-size bed, and a city view. The Standard King accommodates up to two adults and ' +
      'one child under the age of twelve, who stays free when sharing a room with a parent or guardian. Rates for the ' +
      'Standard King start at $149 per night before taxes and fees.'
  ),
  S('Deluxe Queen'),
  P(
    'The Deluxe Queen offers approximately three hundred and fifty square feet of living space, two queen beds, and a ' +
      'river or skyline view depending on the floor. This room is ideal for families and small groups. Each Deluxe Queen ' +
      'includes a sitting area with a sofa bed, a Keurig coffee maker, a mini refrigerator, and a second bathroom vanity. ' +
      'The Deluxe Queen accommodates up to four adults. The nightly rate for a Deluxe Queen is $189 before taxes and fees.'
  ),
  S('Riverside Suite'),
  P(
    'The Riverside Suite is the flagship accommodation of the hotel. The suite occupies a corner of the eighteenth floor ' +
      'and offers approximately nine hundred square feet of space, a separate living room, a dining table for four, a ' +
      'king-size bed in the bedroom, and floor-to-ceiling windows overlooking the Ohio River. Riverside Suite guests enjoy ' +
      'complimentary access to the Executive Lounge for breakfast and evening refreshments. The Riverside Suite accommodates ' +
      'up to three adults. The nightly rate for the Riverside Suite is $329 before taxes and fees.'
  ),
  S('Room amenities by category'),
  R([
    ['Standard King', 'King bed, city view, 300 sq ft, up to 2 adults'],
    ['Deluxe Queen', 'Two queen beds, river or skyline view, 350 sq ft, up to 4 adults'],
    ['Riverside Suite', 'King bed, separate living room, river view, 900 sq ft, up to 3 adults'],
  ]),
  P(
    'All categories include in-room safes, a hair dryer, an iron and ironing board on request, and a selection of premium ' +
      'toiletries. Accessible rooms with roll-in showers are available in each category and can be requested when you book. ' +
      'Rooms that connect to an adjoining room are available for families and groups. Please ask the reservations team if ' +
      'you need a connecting room, as these are limited and assigned on a first-request basis.'
  ),

  // ---------------------------------------------------------------- Dining
  H('Dining and Drinks'),
  P(
    'Our dining program is led by executive chef Marcus Tilley and focuses on regional ingredients from the Ohio Valley. ' +
      'Guests can enjoy every meal of the day at The Fountain Room, our full-service restaurant on the ground floor, or order ' +
      'room service at any time during the hours listed in this section.'
  ),
  S('The Fountain Room'),
  P(
    'The Fountain Room is named after the historic fountain in our atrium and serves breakfast, lunch and dinner. Dinner ' +
      'reservations are recommended, especially on Friday and Saturday evenings. Guests may book a table through the front ' +
      'desk, the concierge, or the reservation link on our website.'
  ),
  R([
    ['Breakfast', '6:30 AM to 10:30 AM, daily'],
    ['Lunch', '11:30 AM to 2:30 PM, Monday to Friday'],
    ['Dinner', '5:30 PM to 10:00 PM, daily'],
  ]),
  P(
    'Breakfast at The Fountain Room is served as a buffet with hot items, fresh fruit, pastries, cereals, and a made-to-order ' +
      'egg station. A continental breakfast is included with the Riverside Suite. Dinner features a seasonal menu with ' +
      'several vegetarian and gluten-free options, and our kitchen will happily accommodate food allergies when notified ' +
      'at the time of booking.'
  ),
  S('Lobby Bar'),
  P(
    'The Lobby Bar sits beside the main entrance and offers a relaxed setting for cocktails, local craft beers, wine by ' +
      'the glass and light bites. The bar is open from 11:00 AM until midnight every day of the week. Live acoustic music ' +
      'is performed on Thursday and Saturday evenings from 8:00 PM. Guests must be at least twenty-one years old to order ' +
      'alcoholic beverages, and a valid photo identification is required.'
  ),
  S('Room service'),
  P(
    'Room service is available from 6:30 AM until 11:00 PM. A selection of breakfast, lunch and dinner items is available ' +
      'from the in-room dining menu, which can be found on the desk or on the in-room tablet. A delivery charge of $5 applies ' +
      'to orders placed after 9:00 PM. Please allow thirty to forty-five minutes for delivery during peak hours. Late-night ' +
      'snacks are available from the Lobby Bar until midnight.'
  ),

  // ------------------------------------------------------------- Amenities
  H('Amenities and Facilities'),
  P(
    'Guests at the Queen City Hotel have access to a range of facilities designed to make a stay comfortable whether you ' +
      'are traveling for business or for pleasure. Most amenities are included in the room rate, and the few that carry a ' +
      'fee are noted below.'
  ),
  S('Rooftop pool'),
  P(
    'Our heated rooftop pool overlooks the city skyline and is one of the most sought-after spaces in the hotel during ' +
      'summer. The pool is open from 7:00 AM to 9:00 PM daily, from May through September. Poolside towels are provided, ' +
      'and a small bar serves cold drinks and snacks during open hours. Children under the age of fourteen must be ' +
      'accompanied by an adult at all times. Glass containers are not permitted on the pool deck.'
  ),
  S('Fitness center'),
  P(
    'The fitness center is located on the second floor and is open twenty-four hours a day for hotel guests. The room ' +
      'includes cardiovascular machines, a set of free weights, adjustable benches and a stretching area. Guests can ' +
      'request a personal training session at the front desk, which is scheduled in advance and charged to the room.'
  ),
  S('Spa'),
  P(
    'The Harbor Spa offers massage, facial treatments, and body wraps by appointment. Treatments are scheduled between ' +
      '9:00 AM and 8:00 PM. We recommend booking at least two days in advance during holidays and weekends. Spa guests ' +
      'have access to a steam room and a relaxation lounge free of charge on the day of their appointment.'
  ),
  S('Wi-Fi and business center'),
  P(
    'Complimentary high-speed Wi-Fi is available throughout the hotel, including every guest room, the lobby, the ballroom ' +
      'foyer and the pool deck. No password or registration is required. The business center on the mezzanine level is ' +
      'open from 7:00 AM to 9:00 PM and offers computers, a black-and-white and color printer, a fax service, and ' +
      'a shredding station. Printing is charged at 25 cents per page.'
  ),
  S('Accessibility'),
  P(
    'The Queen City Hotel is committed to welcoming guests of all abilities. The main entrance, lobby, restaurant, ballroom ' +
      'and business center are fully accessible without steps, and the hotel has two elevators with audible announcements ' +
      'and braille controls. Accessible guest rooms include roll-in showers, lowered sinks, and visual alarms for the ' +
      'hearing impaired. Service animals are welcome throughout the property and do not count toward the pet policy. ' +
      'Guests who need assistance with boarding the airport shuttle or with luggage should let the bell desk know in advance.'
  ),
  S('Other services'),
  L([
    'Laundry and dry cleaning: drop off before 9:00 AM for same-day return on weekdays.',
    'Luggage storage: available at the bell desk before check-in and after check-out.',
    'Gift shop: sells local souvenirs, snacks and travel essentials, open 8:00 AM to 8:00 PM.',
    'Hotel shuttle to the nearby conference center: scheduled on request.',
  ]),

  // ------------------------------------------------- Booking and Pricing
  H('Booking, Check-in and Pricing'),
  S('Check-in and check-out'),
  P(
    'Standard check-in time is 3:00 PM. If your room is ready earlier, our team will contact you. Early check-in is ' +
      'subject to availability, and guests who arrive before 3:00 PM may leave their luggage with the bell desk. Standard ' +
      'check-out time is 11:00 AM. Late check-out until 1:00 PM can be arranged for a fee of $40, subject to availability, ' +
      'and must be requested at the front desk before 9:00 AM on the day of departure.'
  ),
  S('Cancellation policy'),
  P(
    'Reservations may be cancelled free of charge up to 48 hours before the scheduled arrival date and time. Cancellations ' +
      'made within 48 hours of arrival, or no-shows, will be charged the first night of the booking. Reservations made ' +
      'through third-party booking sites follow the cancellation policy of that site, which may differ from ours. Group ' +
      'bookings of ten rooms or more follow a separate contract that is provided at the time of booking.'
  ),
  S('Deposit policy'),
  P(
    'A deposit equal to the first night of the stay, plus applicable taxes, is charged at the time of booking for all ' +
      'direct reservations. Deposits are refunded in full when a reservation is cancelled within the free cancellation ' +
      'window. At check-in, a pre-authorization of $150 per night is placed on the payment card to cover incidental charges ' +
      'such as food, beverages, minibar items and spa services. This hold is released within three to five business days ' +
      'after check-out.'
  ),
  S('Rates and taxes'),
  R([
    ['Standard King', 'from $149 per night'],
    ['Deluxe Queen', 'from $189 per night'],
    ['Riverside Suite', 'from $329 per night'],
    ['Hotel occupancy tax', 'Applied to all room rates'],
    ['Resort and amenity fee', 'None'],
  ]),
  P(
    'Rates are quoted before applicable state and city taxes. Our rates include in-room Wi-Fi, use of the fitness center, ' +
      'the rooftop pool and the business center. Weekend and holiday rates may be higher than the rates listed above. ' +
      'Corporate and government rates are available with a valid account number and are displayed when you log in to your ' +
      'profile on our website.'
  ),
  S('Accepted payment methods'),
  P(
    'We accept Visa, Mastercard, American Express, and Discover credit and debit cards. Payment is also accepted in ' +
      'U.S. dollars in cash for incidental charges, but cash is not accepted as a deposit or for room rates. We also accept ' +
      'Apple Pay and Google Pay at the front desk and on our website. Our hotel does not accept personal checks.'
  ),

  // ------------------------------------------- Location and Transport
  H('Location and Transport'),
  P(
    'The Queen City Hotel is located in the heart of downtown Cincinnati, Ohio, at the corner of Fourth Street and Main ' +
      'Street. The hotel is close to the city riverfront, the Great American Ball Park, the Cincinnati Museum Center and ' +
      'the Findlay Market district. Guests can reach most of the city center on foot in under twenty minutes.'
  ),
  S('Airport shuttle'),
  P(
    'Our airport shuttle connects the hotel with Cincinnati/Northern Kentucky International Airport, located about ' +
      'thirty minutes south of downtown. The shuttle departs from the hotel entrance every hour on the hour, from 5:00 AM ' +
      'until 10:00 PM. The one-way fare is $25 per person and is paid directly to the driver in cash or by card. The trip ' +
      'takes approximately thirty to forty minutes depending on traffic. Reservations are recommended for groups of four or ' +
      'more. Children under five ride free.'
  ),
  S('Parking'),
  P(
    'Valet parking is available at the Fourth Street entrance for $35 per night, including in and out privileges. Self-park ' +
      'options are available in the public garage across the street at a reduced nightly rate of $22. Electric vehicle ' +
      'charging stations are located on level two of the garage. Oversized vehicles, trucks, and trailers must be ' +
      'arranged in advance with the valet team.'
  ),
  S('Getting around the city'),
  P(
    'The Cincinnati Bell Connector streetcar stops half a block from our main entrance and runs between the riverfront and ' +
      'the Over-the-Rhine neighborhood. Taxi and rideshare pickups are located on Main Street directly outside the hotel. ' +
      'The concierge desk can arrange private car service for airport transfers, event transportation and day trips to ' +
      'destinations such as Kings Island and the Ohio River Museum.'
  ),
  S('Nearby attractions'),
  L([
    'Cincinnati Museum Center at Union Terminal, about 10 minutes by car, known for its Art Deco architecture and museums.',
    'Great American Ball Park, a short walk along the riverfront, home of the Cincinnati Reds.',
    'Findlay Market, the oldest continuously operating public market in Ohio, open Wednesday to Sunday.',
    'Over-the-Rhine, a historic neighborhood with breweries, boutiques and restaurants within walking distance.',
    'Smale Riverfront Park, a waterfront promenade with views of the Ohio River and the Roebling Suspension Bridge.',
  ]),

  // -------------------------------------------------------------- Policies
  H('Hotel Policies'),
  S('Pets'),
  P(
    'The Queen City Hotel is pet-friendly and welcomes small dogs weighing less than 25 pounds. A non-refundable pet fee ' +
      'of $50 per stay applies to each pet. Guests must sign the pet agreement at check-in and keep their pet on a leash in ' +
      'public areas. Pets are not permitted in the Fountain Room, the Lobby Bar, the rooftop pool or the spa. Pets may not ' +
      'be left alone in guest rooms for extended periods. Cats, birds, reptiles and other animals are not permitted.'
  ),
  S('Smoking'),
  P(
    'The Queen City Hotel is a non-smoking property. Smoking, vaping and the use of e-cigarettes are not permitted in ' +
      'guest rooms, meeting rooms, corridors, the restaurant or any indoor public area. Designated outdoor smoking areas are ' +
      'located at the Main Street and Fourth Street entrances. A cleaning fee of $250 applies to any room where smoking is ' +
      'detected.'
  ),
  S('Children'),
  P(
    'Children under the age of twelve stay free when sharing a room with a parent or guardian, using existing bedding. ' +
      'Extra beds and cribs are available on request at no additional charge, subject to availability. Teenagers aged twelve ' +
      'and older are charged the adult rate. Children must be supervised at all times in the pool, fitness center and ' +
      'business center.'
  ),
  S('Quiet hours'),
  P(
    'Quiet hours at the hotel run from 10:00 PM to 7:00 AM every day. During this time we ask guests to keep noise to a ' +
      'minimum in corridors and public areas, and to limit television and music volume in their rooms. Guests who are ' +
      'hosting late events should speak with the front desk in advance so that neighboring guests can be informed.'
  ),
  S('Guest conduct'),
  P(
    'Guests are expected to treat our staff and other guests with respect. Visitors are welcome in the lobby and public ' +
      'areas, but must leave the hotel by 11:00 PM unless they are registered guests. The maximum occupancy of each room ' +
      'is strictly enforced for safety reasons. The hotel reserves the right to end a stay where guests violate these ' +
      'policies after a warning has been given.'
  ),

  // ----------------------------------------------------------------- Events
  H('Events, Meetings and Weddings'),
  P(
    'The Queen City Hotel hosts conferences, corporate retreats, weddings, galas and private celebrations throughout the ' +
      'year. Our events team works with clients from the first inquiry through the final toast, and offers coordination ' +
      'services for guests who want a hands-off experience.'
  ),
  S('Ohio Ballroom'),
  P(
    'The Ohio Ballroom is our largest event space, with views across the river and a sprung wooden dance floor. The room ' +
      'can accommodate up to 300 guests for a seated dinner or reception, and up to 400 guests for a standing reception. ' +
      'Natural light, a built-in stage and a separate bridal suite make the ballroom a popular choice for weddings. The ' +
      'Ohio Ballroom can be divided into two smaller rooms with an acoustic partition wall.'
  ),
  S('Meeting rooms'),
  P(
    'The hotel has four meeting rooms named after Ohio rivers: the Miami, Scioto, Little Miami and Muskingum rooms. Each ' +
      'room has natural light, flexible seating for up to 40 people in theater style, and a dedicated coffee break area. ' +
      'Half-day and full-day meeting packages include a continental breakfast, lunch, afternoon refreshments, and high-speed ' +
      'internet access for all attendees.'
  ),
  S('Audio-visual equipment'),
  P(
    'Our in-house audio-visual team provides projectors, large LED displays, lapel and handheld microphones, a sound system ' +
      'for the Ohio Ballroom, video conferencing equipment and live streaming support. Technical support is available during ' +
      'all event hours. Equipment can be reserved when you book your meeting, and our team will be happy to test ' +
      'presentations on site in advance.'
  ),
  S('Wedding packages'),
  P(
    'Our wedding packages are designed to be flexible. The Classic package includes ballroom rental for six hours, a seated ' +
      'dinner for up to 150 guests, a bridal suite for the night of the wedding, and a dedicated event coordinator. The ' +
      'Signature package adds a champagne toast, a custom cake, a late-night snack station and a welcome reception in the ' +
      'lobby. Our wedding planners can also arrange a rehearsal dinner in The Fountain Room, and room block discounts for ' +
      'out-of-town guests. Tasting appointments are available on weekday afternoons.'
  ),
  S('Booking an event'),
  P(
    'To begin planning an event, please contact our events team by email or by calling the sales office. A deposit of 25 ' +
      'percent of the estimated event cost is required to secure the date. The balance is due fourteen days before the ' +
      'event. Outside catering is not permitted in the Ohio Ballroom, but our culinary team will happily work with dietary ' +
      'requirements and custom menu requests.'
  ),
];

function render(doc: PDFKit.PDFDocument, blocks: Block[]): void {
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  for (const b of blocks) {
    switch (b.kind) {
      case 'break':
        doc.addPage();
        break;
      case 'h1':
        doc.moveDown(0.4).font('Helvetica-Bold').fontSize(20).fillColor('#1f3a5f').text(b.text, { width });
        doc.moveDown(0.6);
        break;
      case 'h2':
        doc.moveDown(0.3).font('Helvetica-Bold').fontSize(13).fillColor('#2b2b2b').text(b.text, { width });
        doc.moveDown(0.2);
        break;
      case 'p':
        doc.font('Helvetica').fontSize(10.5).fillColor('#222222').text(b.text, { width, align: 'left', lineGap: 2 });
        doc.moveDown(0.6);
        break;
      case 'list':
        doc.font('Helvetica').fontSize(10.5).fillColor('#222222');
        for (const item of b.items) {
          doc.text(`- ${item}`, { width, indent: 10, lineGap: 2 });
          doc.moveDown(0.25);
        }
        doc.moveDown(0.4);
        break;
      case 'rows':
        for (const [label, value] of b.rows) {
          doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#222222').text(label, { continued: true, width: width * 0.4 });
          doc.font('Helvetica').text(`  ${value}`, { width: width * 0.6 });
        }
        doc.moveDown(0.6);
        break;
    }
  }
}

const doc = new PDFDocument({
  size: 'LETTER',
  margins: { top: 60, bottom: 60, left: 64, right: 64 },
  info: {
    Title: 'Queen City Hotel Cincinnati - Guest Information Guide',
    Author: 'Queen City Hotel',
    Subject: 'Sample hotel guide for the Cincinnati Hotel Chatbot',
  },
  bufferPages: true,
});

const stream = createWriteStream(OUT);
doc.pipe(stream);

render(doc, content);

// Footer with page numbers on every page.
const range = doc.bufferedPageRange();
for (let i = range.start; i < range.start + range.count; i++) {
  doc.switchToPage(i);
  // Footer sits inside the bottom margin; drop the margin so pdfkit does not add a page for it.
  doc.page.margins.bottom = 0;
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#777777')
    .text(`Queen City Hotel - Guest Information Guide - Page ${i + 1}`, 64, doc.page.height - 40, {
      width: doc.page.width - 128,
      align: 'center',
      lineBreak: false,
    });
}

doc.end();
await new Promise<void>((resolve, reject) => {
  stream.on('finish', () => resolve());
  stream.on('error', reject);
});
console.log(`Wrote ${OUT} (${range.count} pages)`);

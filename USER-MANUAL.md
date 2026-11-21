# Balancr - Simple User Manual

*by Syndicate Software Solutions*

A simple bookkeeping tool for small businesses. Track what you sell, what you buy, and see your profit in plain language.

---

## Quick Start (5 minutes)

### 1. Set Up
- Open the app and create your account (email + password)
- Go to **Settings** and set your currency (e.g., LKR, USD)

### 2. Add What You Sell
Go to **Products** and click "+ Add item"

**For physical products:**
- Name: "T-shirt"
- Type: Product
- Price: 1500
- Cost: 800

**For services:**
- Name: "Consulting hour"
- Type: Service
- Price: 5000
- Cost: 2000 (your time, materials, etc.)

### 3. Log Your First Sale
Go to **Sales** and click "+ Add sale"
- Select what you sold
- How many: 1
- Price: 1500
- Date: today

That's it! You'll see your profit on the Dashboard.

---

## Day-to-Day Tasks

### Adding Products or Services
**Products** page → "+ Add item"

**Physical product** (things you buy and resell):
- Type: Product
- Set your selling price
- Set what it costs you to buy
- Add SKU if you use barcodes

**Service** (your time, labor):
- Type: Service
- Set your hourly rate or per-job price
- Set what it costs you (materials, subcontractor fees)

**Sizes and colours (variants):** on the Products page click **+ Sizes / colours**. Type the item name (say "Polo shirt"), the sizes ("S, M, L, XL") and, if you like, the colours ("Red, Blue"). Balancr creates one item for every combination, each with its own code, stock count, cost and price. You then buy, sell and return each one like any other item. A **Sizes & colours** panel on the Products page shows total stock for the whole item and which sizes have run out. Running it again is safe: items that already exist are skipped, so you can add one more size later.

**Units (buy by the carton, sell by the piece):** when adding or editing a product, open **Units**. Say what you count and sell in (pc, kg, m, litre). Add any bigger unit you buy in — "Carton" with how many pieces are in it. From then on, when you log a purchase or a purchase order for that item, you can choose **Carton**: enter 5 cartons at the carton price and Balancr saves it as 60 pieces at the price per piece. Your stock, profit and margins are always per piece, so nothing else changes. On the Products page stock shows as, say, "63 pc" with "5 Carton + 3 pc" under it. Tick **Sold in parts** for things you sell by weight or length (2.5 kg) so quantities with decimals are allowed. You can sell by the pack too: see "Logging Sales" below.

### Logging Sales
**Sales** page → "+ Add sale"
- What did you sell?
- How many?
- At what price?
- Who bought it? (optional)
- Any notes? (optional)

**Sold through.** Under "Add notes / project" (on the multi-item invoice it sits under the notes) there is a **Sold through** box: Walk-in, Wholesale, Online, Phone / WhatsApp, Agent / reseller, Tender / project, or any name you use. It is optional and changes no money figure. The **Sales** page then shows **Sales by channel**: for this month, the last 30 or 90 days, or this year, the sales value, gross profit and margin of each way of selling, and the share of sales each one made. Sales with no channel are grouped as "Not recorded", so you can tag them later. Clear the box on an existing sale to remove the channel. The sales CSV has a "saleChannel" column. This is different from **Marketing by channel** on the Leads page, which asks where the customer came from; one wholesale order can be a Wholesale sale and come from a Facebook lead at the same time.

**Tips.** On a single sale you can type a **Tip** (optional), which is passed on to your staff. Leave it empty for no tip. The **Tips this month** card on the Sales page adds up the month's tips, the number of sales with a tip and the average tip. It appears once a sale has a tip.

Limits. A tip is not revenue or profit, and it changes no figure on My Profit, the tax figures or the cash figures. Tips are recorded on single sales, not on multi-item invoices. Balancr does not pay anyone; the tip total is there so you can pay it out yourself.

**Selling by the pack.** If the item has a pack set up under **Units** (say a Carton of 12), a **Selling in** choice appears on the sale form. Pick **Carton**, then enter how many cartons and the price per carton. Balancr saves it as the same sale in single pieces, so 5 cartons at 1,200 is 60 pieces at 100: your stock, profit, tax and margins are exactly what they would be if you had typed 60 and 100. The pack you typed is added to the sale's notes ("5 × Carton (12 pc each)"). Switching between pieces and a pack carries the usual price across (usual price × pack size) unless you typed your own. Whole packs only, unless the item is "Sold in parts". The multi-item invoice has the same choice on each line. Estimates and repeating invoices stay in single pieces. Floor staff see the same pack choices, but a product whose packs were set up before this update shows them to staff only after it is saved once.

**Delivery charged to the customer.** Turn it on once under **Settings → General → Delivery charge on sales** (pick an existing "Delivery" service, or let Balancr create one called "Delivery charge"). After that the sale form and the multi-item invoice form have a **Delivery charged to the customer** box. Fill it in and the charge is saved as its own line on the same invoice: same customer, date, payment method and credit terms, so a credit sale's balance covers goods and delivery together. It is income with no stock cost, and it is taxed like every other line when sales tax is on. It works in a foreign currency too. Goods and delivery are saved together, so you never end up with one without the other. If you edit or delete a sale later, the delivery line is its own row. What delivery costs *you* is separate: set it on the Delivery item under Products → variable costs, so profit is not quietly overstated. Turning the setting off hides the box and leaves every delivery line already sold as it was. A delivery line is flagged for good when it is created, so it is not counted as a unit sold and never earns a salesperson commission (even if you later turn delivery off).

**Shelf or bin.** On the product form, type where it sits (for example A-03). The **stock count** lists items in shelf order, so you walk the shop once, and each line shows its shelf. Limits: the shelf is for finding items only; it changes no stock, cost or profit figure, and items without a shelf are listed last, by name.

**Sell again.** On the Sales page, press **Sell again** on any sale and the sale form opens already filled in with the same item, quantity, price, customer and how they paid. The date is today, and the old notes, serial number and invoice are not copied. It repeats that one line; for a multi-item invoice, repeat each line you need. Delivery lines are not repeated on their own. Staff see the same button on the Sales page.

### Customers and Credit Limits

**Extra customer details.** Under **Settings**, type up to four names for extra details, such as "Vehicle number, Birthday". Each customer then has a box for each one, shown on their card. Limits: these are for your records and lookups only; no balance, sale or credit check reads them, and removing a name from the list hides its boxes without deleting what was typed.

When a customer owes you money, their row shows **Statement** (on a phone: **Print statement of account**). It opens a one-page statement of every open invoice, what is overdue and the total owed, which you can print or save as PDF to send to a slow payer.

On the **Items** page, **Slow stock** appears only when something you hold has not sold for 90 days or more. It shows the cash tied up in it (at cost), so you can discount it, bundle it or stop reordering.

**Lost sales (when you ran out).** When a customer wanted something you had none of, log it: **Products → Lost sales (out of stock) → Log a lost sale** (item, how many they wanted, the price you would have charged). On the sale form, if you type more than you have, a link offers to log the part you can't supply and sell only what you have. Balancr records the price you would have charged and what the item costs you at that moment, then shows, for the last 90 days, the sales and the margin lost, with the item that cost you most at the top. It is a memo only: it never changes stock, sales, profit, cash or any statement, and only entries you log are counted. Owners and managers log it; only the owner deletes an entry.
**Customers** page → "+ Add customer" (or **Edit** on an existing one)
- Save a name and phone number once; after that they're one tap in the sales form.
- **Credit limit (optional, owner/manager):** the most you're comfortable with this customer owing you at once. Leave it blank for no limit.
- It's a **warning, not a lock**. If a customer owes more than their limit, the Customers page shows "Rs X over limit" beside them, and the credit-sale form tells you *before* you save ("With this sale Acme would owe Rs 70,000 in total — Rs 20,000 over their limit"). You can still go ahead.
- To remove a limit, clear the box and save.

- Staff see the customer list and whether a limit exists, but not balances or profit — they're told to check with a manager before giving more credit.
- The AI Assistant's "Confirm all" and "Save without reviewing" will not save a credit sale that takes a customer over their limit; it stays waiting for you to review.

## Giving your accountant access

**Team access → + Invite someone → Role: Accountant (view only).** Send them the link. They get their own login and can
view and print everything in the books (sales, purchases, bills, money owed, profit, balance sheet, loans, fixed assets)
and download the **Accountant pack** (CSV files and aging reports). They can't add, change or delete anything, and they
never see payroll, your team list, settings, the activity log or the AI assistant. Remove their access any time from the
same page. One login works for one business, so an accountant with several clients uses a different email per client.

**Tax-exempt customers.** On a customer's details, tick *Tax-exempt customer*. From then on no sales tax is charged on sales to that customer, on the quick-sale form, on delivery, and on estimates. Sales already recorded keep the tax they had, so past figures do not change. Matching is by name, ignoring capitals and spaces, so use the same name on the sale as on the customer.

### Buying Stock or Materials
**Purchases** page → "+ I bought something"
- What did you buy?
- How many?
- What did each one cost?
- From whom? (optional)
- Date of purchase

**For services:** Use this to log what it cost you to deliver (labor hours × rate, materials per job)

**Freight, customs and delivery costs:** if getting the stock to you cost extra, add it when you log the purchase (**+ Add freight / customs**), when you receive an order (**Receive order → + Add freight / customs / handling**), or on the quick **Buy more** form (**Delivery / freight / import costs**). Enter the total for the whole delivery. It is spread across the units and added to what each one cost you, so your stock value, cost of goods and margin show what the stock really cost, not just the supplier's price.

**Sending goods back to a supplier (faulty, wrong item, too many):** on **Purchases**, click **Send back** on the purchase the goods came from. Say how many, how much the supplier is giving back, and how they settle it:
- **They pay me back** (cash, bank transfer or card): the money comes in, and the stock goes down.
- **Take it off what I owe them** (only for a purchase you bought on credit and haven't fully paid): your bill to that supplier drops. No cash moves, and you won't be reminded about money you no longer owe.
- **Keep it as credit with them, for a later order** (needs a supplier name on the purchase): nothing is paid or received now, the stock goes down, and the value (goods plus tax) becomes **credit held with that supplier**. See "Supplier credit" below.

The screen shows in plain words what will happen before you save. The goods leave your stock at the cost they came in at, so the average cost of the stock you keep is not disturbed, and sales you already made keep their original cost. If the supplier gives back exactly what you paid, your profit does not change. If they keep a restocking fee or credit you less, that difference counts as a cost of goods that month. Tax on the goods goes back with them. You can't send back more than you bought, more than you have in stock, or more credit than is still owed on the bill. A purchase that has returns against it can't have its quantity, cost, tax or payment terms edited — delete the return first. Owner only to delete; blocked in a closed month.

**Supplier credit (credit notes and deposits you hold with a supplier).** Open **Suppliers → Credit held with suppliers** and click **Manage** on a supplier (or choose **Record a deposit…**). The balance with a supplier is: credit kept from goods you sent back, plus deposits you paid in advance, minus credit you have used, minus credit they paid back. From the panel you can record:
- **I paid them in advance (deposit):** the money leaves your till or bank now and becomes credit held. It is not an expense.
- **Use credit on one of their bills:** pick an open credit bill and an amount. What you owe on that bill drops by that amount and the credit held drops by the same. No cash moves, and the bill stops showing as overdue for money you no longer owe.
- **They paid the credit back to me:** the money comes in and the credit held drops.

Credit held is an **asset** ("Credit held with suppliers" on the balance sheet), because the supplier owes you that value. Deposits and refunds appear in the cash-flow lines and, when paid by bank or card, are offered for matching on the Reconciliation page; cash ones count in the day's till count. Guards: you can't use or refund more than the supplier holds for you on that date (so a back-dated entry can't overspend), can't use more than is still owed on the bill, can't use a bill that belongs to another supplier, and can't date any of it in the future. You can't delete a return or deposit whose credit has already been used or refunded (delete those entries first), and a purchase with credit used on it can't have its quantity, cost, tax or terms edited until that entry is deleted. Closed months refuse these entries like any other money movement. Owners delete entries from the panel's history; managers can add them.

**Approval for large orders.** On the Requests tab the owner can set an amount (Purchase order approval). A purchase order whose total is above it is held as *waiting for approval* at the top of the Purchase orders page. An owner or manager approves it, which places the order, or rejects it, which cancels it and keeps the reason. A waiting order is not counted as committed and cannot be received. Leave the amount empty or 0 to approve nothing.

### Waitlist and backorders (Operations page, Waitlist and Backorders tabs)

**Waitlist.** When a slot, table or event is full, add the person to the waitlist with the day they want and what they want. Anyone who works in the business can add to it and move each entry on: offered, booked or removed. The list shows how many are still waiting.

**Backorders.** When a customer orders something you have run out of, log a backorder with the item, the customer, the day it was ordered, and how many were short. Anyone who works in the business can log one and mark it fulfilled or cancelled once the stock arrives and the customer is served. The tab shows the open backorders and the number of units still short. A backorder records no sale and moves no stock: it is a note of what is owed, so the sale is recorded when the goods are handed over.

Limits, stated plainly: neither record posts to the books or moves stock, and no one is contacted from them.

### Supplier price watch (Suppliers page)

When an item's latest delivery cost at least 5% more than the deliveries before it, a **Supplier price watch** card appears at the top of **Suppliers**. For each item it shows the new cost against the old, what that rise added to the last delivery, and what it does to your margin at the item's usual selling price. It also tells you whether the supplier raised the price or only the exchange rate moved (when the purchases were priced in a foreign currency), and which other supplier delivered the same item clearly cheaper in the last six months, and the selling price that would bring your old margin back. Use it as a prompt to phone the supplier, ask a rival for a quote, or raise your selling price. It only reads purchases you already recorded and changes no cost, stock or profit figure. Nothing shows until there are two deliveries of an item to compare.

### What to order now (Wholesale orders)

The top of **Wholesale orders** shows **What to order now** whenever an item's stock, plus anything already on order, has fallen to its reorder point. For each item you get a suggested quantity (enough to get back above the reorder point plus one economic batch), the supplier you last bought it from, and the cost at the latest price you paid. Items are grouped by supplier with a total for each, so one phone call covers everything for that supplier. Next to the total is **Safe to commit**: your cash after what you already owe and three months of fixed costs and loan payments. If you cannot afford everything, the most urgent items (least days of stock left) are covered first and the rest are marked **Wait**. It places nothing and changes no stock or cash figure. Items with no sales history yet do not appear, because there is nothing to base a quantity on.

### Order from the list (What to order now)

Each line in **What to order now** has an **Order** link. It opens the normal order form already filled in with the item, the suggested quantity, the cost and the supplier. Check it, change anything you like, and press Place order. Nothing is placed until you do.

### Budget by category (Expenses)

At the top of **Expenses**, **Budget by category** shows what you meant to spend in each category each month against what you actually spent, for this month or last month. The owner chooses **Set budgets** and gives a monthly amount to each category. A category shows **on track**, **close** (80% or more used) or **over**, with a bar and what is left. Spending in a category with no budget is shown separately, so nothing hides. It is a plan to hold yourself to: it changes no expense, profit or cash figure.

### Supplier statement (Suppliers)

When you still owe a supplier something, their row on **Suppliers** has a **Statement** button. It prints a one-page statement of what your books say you owe them: each credit purchase and bill, what was billed, what has been paid or credited, and the balance, with anything past due called out. Send it to the supplier, or lay it next to the statement they sent you at month end to find a difference. It is built from the same lines as **Money owed**, so the total always matches that screen, and it changes nothing.

### Adding Regular Expenses
**Expenses** page → "+ Add item"

**One-time costs:**
- Kind: Expense
- Amount: 50000
- Date: when you paid

**Recurring costs (rent, subscriptions, salaries):**
- Kind: Expense
- Amount: 15000
- Cadence: Monthly
- Start date: when it starts

**Recurring revenue (retainer clients):**
- Kind: Revenue
- Amount: 50000
- Cadence: Monthly

**Repeat income on the Dashboard.** Once you have any recurring revenue, the Dashboard shows a *Repeat income* row: what it adds up to
per year (monthly x 12), what started and what ended in the last month (and the % lost), what share of your last 3 full months of
income repeated, and whether repeat income covers your regular costs (1.00x means it just does). To make "ended" show up, give a
cancelled subscription or retainer an **end date** instead of deleting it. It reads only the recurring items you entered, so it is as
complete as those entries.

### Expiry dates (food, medicine, cosmetics, anything that goes off)
On **Purchases** → "I bought something", fill **Use-by / expiry date** (and the supplier's **Batch / lot number** if there is one) for goods that spoil. The **Receive order** form on Purchase orders has the same two optional boxes, so stock that arrives through an order is covered too (a CSV import has no such columns; edit the purchase to add them).
They change no cost, stock or profit: they only let the app warn you.

- **Health page → Expiry watch** lists stock already past its date and stock running out within 30, 60 or 90 days (your choice), soonest first, with the
  value at cost. The **Dashboard** shows a one-line notice when anything is expired or about to be.
- **Health page → Batch trace** (appears once any purchase has a batch number or expiry date): pick a product, see each batch (received, sold, left), and tap
  a batch to see **who received it**, with phone or email where you saved one, and **Copy this list** for a recall or a call-round. On the sale form, **Which batch?**
  (owner and manager only, only for goods with batch info) records the exact batch when you know it; leave it on "Not sure" and the app assumes the batch that
  expires soonest went first and marks those lines "estimated". It changes no cost, stock or profit: profit still uses average cost. Units sold with no stock on
  record, and stock found without a batch, are listed under the batches instead of being hidden.
- The Expiry watch below is an estimate. It does not know which physical unit you sold, so it assumes the oldest stock sells first and matches what is left to your newest
  deliveries. If your shelf disagrees, trust the shelf and fix the count with a stock count correction.
- **Write off** on an expired line opens the normal stock adjustment, already filled in (the units, reason "Expired / spoiled", the batch in the note). Saving it
  records the loss in your profit the same way any spoiled stock is recorded, and clears the warning.
- Sell or discount the "running out" stock first. Edit the purchase and empty the date box to remove a date.

### Customer deposits (money taken before you deliver)
**Customers** page → **Customer deposits** → "Record a deposit…" → pick the customer.

A deposit is not sales income. It is money you owe the customer until you deliver, so it sits on the balance sheet as a liability
(*Customer deposits*) and shows in the cash flow as *Deposits received from customers in advance*. Your cash goes up, your profit does not.

- **They paid in advance:** record it as "They paid me in advance". Choose cash, bank or card.
- **You delivered:** record the sale as a **credit sale** (so the invoice exists), then in the customer's panel choose "Use the deposit on one of
  their invoices". The invoice drops by that amount and the deposit you hold drops by the same. No cash moves, because the money came in earlier.
  Whatever is left on the invoice is collected the normal way.
- **You gave it back:** choose "I paid the deposit back to them".
- A deposit can never go below zero on any date, and can't be dated in the future. Deleting a deposit that has already been used is refused
  (delete its uses first). Deleting a sale takes the deposit uses on it with it and puts the deposit back on the customer's balance.
- Money you hold for customers is set aside in the "Safe to commit" figure on Profitability, because it is in your cash but is not yours to spend.

### Tabs (Tabs page, Buy & sell menu, owner, manager and staff)

For a restaurant, café, bar or takeaway. Open a tab for each table, bar seat or takeaway order by name (for example "Table 4"). Two open tabs cannot share a name. Add items with a tap as they are ordered; press + or − to change a quantity, and an item taken down to zero leaves the tab. When the table pays, choose how they pay, and add the customer's name if it is on credit or you want it on the bill. An optional service charge (a percentage of the bill) is recorded as its own line on a service item you choose. Press **Close and charge** and every item is written as an ordinary sale, with its sales tax taken line by line, so stock, reports and the books treat it like any other sale. Closing is one step, so a tab is never half paid. A closed tab cannot be changed. Owner and manager can delete an open tab that has nothing sold on it; a closed one stays on the record.

**Kitchen.** Press **Send new items to the kitchen** on a tab to send what is on it that has not gone yet. Each item is sent once, as a ticket. The **Kitchen** page lists the tickets from every open tab, oldest first; press **Mark preparing**, **Mark ready** and **Mark served** as each one moves along. A served ticket leaves the board. On the tab, each ticket shows its current step. **Print** on a ticket opens a large-type ticket (table, time, items) for the kitchen printer, through the browser's print dialog; allow pop-ups for the site. Limits: tickets are for the kitchen to see only; they change no stock, sale or figure, and payment is still taken on the Tabs page.

**Split equally.** Set **Split between how many people?** on the close form. It shows each person's share, rounded to the cent, with any leftover cents on the last share, so the shares always add up to the bill. Then close the tab with **How they pay** set to Credit and the table name as the customer. The whole bill then sits on Receivables under that name. As each person pays their share, record it there with **Record payment**, and the rest of the bill stays owed until everyone has paid.

**Split the bill.** Press **Split the bill** on a tab, pick how many of each item this group is paying for, and press **Pay for these items**. Those items are recorded as sales and taken off the tab, and the rest stays open for the next person. The tab closes when nothing is left on it. Limits: you split by whole items, not by equal shares, and each payment uses the same payment method, customer and service charge set on the tab. Balancr does not pay anyone; each payment is taken by your click.

### Gift cards (Gift cards page, Buy & sell menu, owner and manager)

**Selling a card.** Enter the value, the buyer's name if you want it for your records, how they paid and the date. The page makes a code such as ABCD-2345 and shows it, with a **Print voucher** button for a printable card. The money is held for the customer until the card is used, so it is not income yet and it shows as "Owed to card holders" on the page.

**Using a card.** Type or scan the code and press Find. The card shows what is left on it and its history. Pick the open invoice it pays (it can be anyone's invoice, because a card is a bearer card: whoever has the code can spend it), check the amount, and press **Use card on this invoice**. Record the sale on credit first if it is not on the books yet.

**Giving the balance back.** If a card will not be used, press **Refund** and the unused balance is paid back in cash. The card is then used up.

Cards have no expiry date. Anyone with the code can spend the balance, so keep codes safe.

Staff at the till can sell a card and print its voucher, from the same page. Staff cannot see balances or history, look a card up, use it on an invoice, or refund one; those stay with the owner and manager.

### Integrations: keys for outside services (Integrations page, Admin menu, owner only)

This is where the keys for outside services go: bank feeds, card payments, email, WhatsApp, SMS, live exchange rates, accounting software, calendars, an online shop. Each service lists the keys it needs. Fill them in and press **Save**. A service shows **Not set up**, **Keys missing**, **Keys saved, switched off** or **Ready**.

- Only **Ready** services may be used, and only once you switch them on. Nothing is sent to an outside service before then.
- Secret keys are entered once. After saving they show only their last four characters. Leave a secret box empty to keep the saved key. **Remove keys** clears a service.
- Only the owner can see or change these keys. They are not in the full backup, and the public demo cannot change them.
- The page lets you hold the keys now. Each service's actual connection is added when you choose to start using it, so a key saved here does nothing on its own until that is set up.
- **Test connection** proves a key works before you rely on it. For **Email sending** (the Resend key) it lists your sending domains, and for **Card payments** (the Stripe secret key) it reads the balance. Both are read-only: a test sends no email and charges no card. The result (Connected, the key was rejected, or the service could not be reached) and the time are shown on the service, and saving the keys again clears it. Other services can be saved but not tested yet.

### Work locations for staff (Team page, owner only)

If the business has two or more locations, the Team page shows **Work locations**. Tick the locations each manager or staff member works at and press **Save**. Nothing ticked means every location, which is how everyone worked before.

- A person with locations ticked sees sales, purchases, stock adjustments, estimates and sale returns only at those locations, and their location picker offers only those. A new entry starts on their first allowed location, so it is not recorded at another branch by mistake.
- Records written before locations existed count as the default location.
- The owner is never limited. A location that is closed or deleted drops out of a person's list; if none of their locations remain, they see nothing until the owner ticks one again.
- This works inside the app. It is not a database-level lock, so it is a way to keep staff to their branch, not a guarantee against someone reading the data another way.

### Staff rota (Rota page, Team menu)

Who works which hours on which day, week by week. Owner and manager set the shifts; everyone on the team can read the rota, so staff can see their own hours.

- **Add a shift** with the button, or press **+ add** in a person's row on the day. Pick the person, the day, the start and end times (24-hour), and optionally where they work and a note. A shift must end after it starts and on the same day: a shift that runs past midnight is entered as two shifts. A shift can be at most 16 hours.
- **Change or remove** a shift by pressing it.
- **Hours** per person and in total are shown for the week, so you can see who is carrying the most before the rota goes out.
- **Leave.** A day on approved leave is shaded, and a shift that falls on it is flagged in red with a list above the grid. Nothing is blocked: you decide whether to move the shift.
- **Copy last week** copies last week's shifts onto the same weekdays of this week. A shift this week already has for the same person, day and start time is skipped, so pressing it twice does nothing the second time.
- Rota shifts are a plan. They do not change pay; pay stays on the employee record.

### Managing Employees

**New starters.** On the Employees page, press **Start onboarding** on a new team member. It adds a six-step checklist as tasks due from today: confirm their details, set up their login, show them the Selling page, show them clocking in and out, walk through the cash count, and review their first week. The tasks show on the Tasks page and the Agenda. Pressing it again adds only the steps that are missing.

**Employees** page → "+ Add employee"
- Name and role
- Gross pay (what you pay them)
- How often (weekly/monthly/yearly)
- Their tax % (for their take-home reference only)

This automatically books their pay as a monthly expense. No need to add it separately.

**Sales commission (optional).** Give an employee a commission % and pick the team login whose sales count (the
salesperson needs their own login under Team access, so their sales can be told apart). The **Sales commission** card
on the same page then shows, for any month, what each person sold (before sales tax, less returns and discounts) and what they have
earned. Invoiced sales count when made, not when the customer pays. Nothing is booked for you: when you pay it, press
**Record as expense**. It adds a one-off "Payroll & labor" expense dated today, and the page will not offer it twice
for the same person and month.

**Paid on profit instead of sales (optional).** In the same employee form, "Commission is paid on" can be switched from net
sales to **profit on those sales**: what each sale left after the cost of the goods and per-sale costs, after any return or
discount, counted in the month of the sale. That pays people for margin, not just volume, so a rep who discounts to hit a
sales number earns less. A month that lost money earns nothing. Use it only if your items have costs recorded; otherwise the
profit figure is not meaningful.

**Payslip (Owner only).** Under the commission card, pick an employee and a month, add that month's overtime hours, allowances,
commission (one tap fills in the month's commission), no-pay days (one tap fills in the no-pay leave you logged) and any other
deductions such as an advance, and press **Print payslip**. It shows gross pay, employee EPF (8%, left off overtime), tax,
other deductions and net pay, and the employer's EPF and ETF below. Overtime is the hours times the hourly rate times the
rate you set (1.5 by default); the hourly rate is the monthly pay divided by the hours in a month (240 by default). Change both
under "Overtime rate and hours in a month" to what you agreed. A no-pay day is the pay for the period divided by its days
(30 for monthly). Nothing is stored. The basic pay and the employer's EPF/ETF are already in your books as the recurring
payroll expense, but overtime and allowances are not, so the page offers **Record overtime and allowances as an expense**, once
per person and month. Commission is recorded from its own card.

**Leave (Owner only).** Below the payslip: **+ Log leave** records annual, casual, sick, other paid or no-pay leave for a person
(first day, last day, and the working days away, which you can lower if the dates include a weekend or a holiday). Set "Paid
leave days a year" when you edit the employee, and the card shows how many are used and left, and flags anyone over. A spell
counts in the year it starts. No-pay leave does not use the allowance; it is offered as no-pay days on the payslip. Leave
changes no money and is in the full backup (and `leave.csv`).

### Tracking Loans
**Loans** page → "+ Add loan"
- Loan name
- Lender (bank name)
- Principal amount
- Annual interest rate
- Term (how many months)

The app automatically calculates monthly payments and splits principal vs interest.

---

## Understanding Your Numbers

### Dashboard
Shows you at a glance:
- Revenue this month
- Expenses this month
- Net profit (what you actually made)
- Cash on hand
- Forecast (what's coming based on trends, plus a best-case/downside range for
  the months ahead so you're not planning off one optimistic number)
- Seasonal view (Dashboard, under the forecast): appears only once you have 24 or more complete months of sales, so a new business sees nothing here. It shows your usual strongest and quietest months and what the trend becomes with them applied. It is deliberately cautious (it pulls its estimates toward "an average month" until you have more years), leaves out the current unfinished month, and changes no figure in your books.
- Stock value and low-stock reorder alerts
- Staff pay and loan obligations due
- True profit (net profit after what your own time is worth)

### Financial Health Page
The "how healthy is the business" page — every number here is explained on the page itself, with plain-language notes on what counts as good or weak:
- **Growth:** revenue and net profit vs. last month, and vs. the same month last year
- **Liquidity:** current ratio, quick ratio, and **working capital** (the dollar amount behind those ratios)
- **Profitability:** gross → contribution → operating → net margin (the full waterfall, each subtracting more — see below), return on equity, and **return on assets**
- **Cash conversion cycle:** days sales/inventory/payable outstanding, and inventory turnover
- **Leverage:** debt-to-equity, debt ratio, and **debt service coverage** (can your cash from operations cover your loan payments)
- **Customer acquisition:** cost per new customer (flagged red/amber when it's creeping close to or past what an average customer brings in over one window — a rough payback check, not the full picture), average customer value, new vs. returning
- **Customer retention:** retention rate, churn rate (flagged when customers are visibly drifting away), active customers
- **Operational risk:** manual correction rate (edits/deletes as a share of everything logged — a rising share can mean sloppy entry, or worth a second look at who's making the corrections) and manual overrides (stock count corrections, bad-debt write-offs, and returns, added up). Not a verdict on their own — corrections happen in any real business — just a signal worth noticing if it climbs.
- **Scale & efficiency:** average order value, revenue per employee, and **cash runway** — how many months you can operate at your current average burn rate

Not tracked, deliberately: **ROAS** (needs ad-platform integration this app doesn't do) and **TAM/SAM/SOM** market sizing (needs external market data — population, competitor share — that no ledger has). Both would mean inventing a number rather than computing a real one, so neither is shown.

Also on this page: **payroll vs. revenue** (today's committed payroll as a % of average monthly revenue — the standard "is labor cost eating the business" check) sits next to the margin figures.

**The margin waterfall**, each step subtracting more than the last:
- **Gross margin** = revenue − cost of goods sold. COGS includes any variable cost you've tagged "counts toward COGS" on the Products page (e.g. outbound shipping) — most SME accounting treats that as part of what it cost you to deliver the sale, not a separate expense.
- **Contribution margin** = gross margin − other variable costs (selling fees, fulfillment, contractor/variable labor, variable marketing) — anything you've added as a **Variable cost** on the Products page and left un-tagged. Answers "after everything that scales with volume, what's left, before fixed costs."
- **Operating margin** = contribution margin − fixed operating costs and depreciation (EBIT). This is where employee payroll counts, via Expenses — not in contribution margin, since counting it in both places would double it.
- **Net margin** = operating result − interest, tax, and one-off items (asset disposals, bad-debt write-offs). What's actually left.

A service delivered by your own employee has a separate **fully-loaded margin** view on Profitability (after that employee's time, via the product's "Your own time on this" field) — that's a what-if lens on one item's true cost, not part of the four margins above.

Cash runway here is different from the Cash Flow page below: this is a trailing average, not a specific date.

### Products Page
- **Stock level:** How many you have
- **Value:** What that stock is worth (at cost)
- **Reorder now:** Flagged when stock (plus anything already on order) falls to daily demand × (lead time + safety buffer days). The buffer is one number under Settings → Operations; leave it at 0 for no cushion, or add a few days if your demand or deliveries are erratic. It only moves the flag, never the EOQ order size.
- **EOQ:** How many to order next time (saves money)
- **Batch discounting:** Tick the checkbox next to any products or services (or "select all" in the table header), then click **Apply % discount…** to knock a percentage off all their sell prices at once — handy for a seasonal sale or a bulk/wholesale deal. Enter a negative number to mark prices up instead. Items with no sell price set are skipped automatically. The same selection also gets a **Delete selected** button (owner only) — for clearing out a batch of duplicates or test items in one go, same "can't be undone, past sales/buys stay on record" rule as deleting one at a time.
- **Units and sizes:** see "Adding Products or Services" above. Stock can show in cartons as well as pieces, and items that come in sizes or colours are summed up in the Sizes & colours panel.
- **Suggest (sell price):** On the Add/Edit product form, once you've entered a name, click **Suggest** next to the sell price field for a starting-price idea from the AI Assistant. This is a rough estimate from the model's general knowledge, not a live market lookup or a real published MSRP — it doesn't know today's prices in your area. Always compare it against what you actually see charged locally before using it, and edit the field yourself if it's off. Counts against the same daily AI Assistant message limit as chat (Settings → AI Assistant).

### Profitability Page

- **Partners and franchise (read-only).** Split the period's profit between partners (2 to 10, shares must total exactly 100%), or work out a franchise royalty as a percentage of the period's revenue. The figures are for reading only: nothing is saved or posted.
- **Eco and sustainability mix (read-only).** Shows what share of the period's sales revenue came from products you tagged as eco or sustainable, and how much from each tag. See the section on eco tags below.
- **Limits.** Partner shares and royalty are worked out on the screen and are not saved. They use the whole months in the period, so a partial first or last month is counted in full. Nothing here changes the books or the profit figures.

At the top, **Monthly revenue and profit** draws revenue and profit after tax month by month, with a dashed straight-line trend through each of them and a line saying how far revenue has moved from the first month to the last. It appears once there are two months of figures and reads the same numbers as the P&L below it.
Shows which items make you the most money:
- Units sold
- Revenue vs cost
- Gross profit per item
- **Margin %** (profit ÷ selling price) and **Markup %** (profit ÷ cost) side by side — these answer different pricing questions and are easy to mix up: a 50% markup is only a 33% margin. Use markup when deciding how much to add on top of what something cost you; use margin when checking what share of the sale price is actually profit.
- **Contribution %** — margin after the item's other variable costs too (selling fees, fulfillment, variable labor, variable marketing), when any are set up. Only shown when the item actually has variable costs attached; otherwise it's the same as gross margin, so it's hidden to avoid clutter.

Green = healthy margins. Red = thin margins (might be too competitive).

**Are You Covering Your Costs?** — break-even, computed from your last 3 months of sales and this
month's regular costs: profit per sale, what your costs are each month, how much you need to sell to
cover them, and your cushion above (or shortfall below) that. If you've logged any owner **withdrawals**
(Money You Put In, below) in the last 3 months, a second line adds your **survival number** — costs plus
what you've actually been taking out — and the sales needed to fund both. It only appears once a
withdrawal is on record; it isn't a number you have to type in yourself.

**Profit by location** (only appears once you have two or more active locations): compares
your branches side by side for the period you pick — orders, revenue, gross profit, margin
and contribution. Every active location is listed, even one that sold nothing (a quiet
branch is information, not something to hide). A cost that belongs to one branch — its
rent, a repair, a local bill — can be tagged to it with the optional **Location** field on
the expense form: one-off costs show as that location's **direct costs** (and the profit
left after them), recurring ones as a **monthly run-rate** shown separately. Overhead with
no location set is never divided between branches by guesswork, so it isn't in these
numbers. Statements stay one consolidated set of books.

**Is this investment worth it?** (collapsed by default, on the Profit page) — a what-if calculator for a
big one-off purchase or expansion. Nothing is saved.
- **Safe to commit** comes first: your cash, minus the sales tax you owe, minus supplier and expense bills
  already owed, minus a **safety buffer** (default 3 months of your regular costs plus loan repayments —
  change it to suit). Cash sitting in the bank isn't spare cash; this is what's left to put to work. Money
  customers owe you isn't counted until it's collected, and the figure deliberately runs low rather than
  high. If cash doesn't even cover what you owe plus the buffer, it says how far short you are.
- Enter the upfront cost and a projected net cash flow per year to get **net present value**, **return
  (IRR)** and **payback**.
- **Stress test:** the same numbers again as *Downside*, *As planned* and *Strong*. You choose how much
  better or worse each year's cash flow could be (defaults +25% / −30%) and how far over budget the upfront
  cost could run in the downside (default 20%). A loss-making year gets smaller in the strong case and bigger
  in the downside. It tells you plainly whether the decision still works in the downside, and whether the
  upfront cost fits inside what you can safely commit. These are your own estimates moved up and down, not a
  forecast — the app can't know how far off you are.

### Statements Page
Three standard financial reports:

**Income Statement:**
- Revenue in
- Cost of goods sold
- Operating expenses
- Net profit

**Cash Flow Statement:**
- Actual cash that moved in/out
- Different from profit (inventory bought today hits cash now, profit later)

**Balance Sheet:**
- What you own (cash + inventory)
- What you owe (loans, accounts payable, sales tax payable)
- What the business is worth (equity)
- **Tax payments made:** on the Balance Sheet tab, record any payment you've actually sent to your tax
  authority. It nets against the sales-tax-payable line so the app stops treating money you've already remitted
  as still owed. This is purely your own log — the app doesn't file, submit, or verify anything with any tax
  authority, so this figure is only as accurate as what you enter here.

**Printing or saving a statement (for your bank, accountant or tax office):**
- The Income statement, Cash flow, Balance sheet and Tax summary tabs each have a **Print / save as PDF**
  button at the top of the page. (The Budget tab doesn't — it's where you type targets in, not something you'd hand to anyone.)
- It prints exactly what's on the screen, on a clean white page with your business name, address, phone and
  logo from Settings at the top. Buttons and forms are left off. Choose "Save as PDF" in the print window to get a file.
- Every page carries a note that the statement is **unaudited and has not been filed with any tax authority** —
  it's prepared from your own records, and it's yours to hand over.
- Add your business name in **Settings** first, otherwise the page has a plain heading instead of a letterhead.
- If nothing happens when you press the button, your browser blocked the pop-up window — allow pop-ups for this site and try again.
- A loss or money going out shows in **red brackets**, e.g. (Rs 12,000.00).

---

## Advanced Features

### Wholesale Orders (Optional)
If you order stock from suppliers and want to track it before it arrives:

**Purchase Orders** page → "+ Place order"
- What product?
- How many?
- Expected cost
- Expected delivery date

When it arrives, click "Receive" and it automatically adds to your Purchases and inventory.

**Short, over or damaged deliveries.** On the receive form, enter the quantity that actually arrived. If it is short or over, the order shows a **Short by** or **Over by** badge. Type anything wrong (for example "2 damaged, 3 short") in **Anything wrong with the delivery?** and it shows on the order for your records. Limits: the note and the badge are for your records only. The stock and the cost still use the quantity actually received, exactly as before, and a damaged unit is not written off by the note; record a write-off as a stock adjustment if you need one.

**Who delivers on time?** The **Suppliers** page has a **Delivery** column worked out from your own orders: of the orders that had an expected date and have now arrived, how many came on or before it (e.g. "80% on time (4 of 5)"), plus any open order that is already past its expected date ("1 overdue"). Colour only appears once a supplier has at least 3 such orders, so one late delivery isn't treated as a verdict; green is 90%+, amber 70%+, red below that. Orders with no expected date, cancelled orders and orders with no supplier name are left out. Use it when deciding where to reorder, or which supplier needs a longer lead time on the Products page.

### Multiple Locations (Optional)
If you sell from more than one place — a second shop, a warehouse plus a storefront —
**Locations** page → "+ Add location" lets you tag where stock physically sits.

- Once you have two or more locations, every Sale, Purchase and stock adjustment picks
  up a location so stock-on-hand can be broken out per place (hover the quantity on
  Products for the breakdown).
- **Transfer stock** moves inventory from one location to another without it looking
  like a sale or purchase.
- Your P&L, cash flow and every report on Statements stay one consolidated set of books
  across all locations, by design. To compare branches, use **Profit by location** on the
  Profitability page (see above). It isn't a full multi-branch accounting split: shared
  overhead is never allocated between branches, and only costs you tag to a location
  (the optional **Location** field on an expense) count against it.
- The Sales, Purchases and Expenses CSV exports include a **location** column (blank on an
  expense means shared overhead).
- Added a branch by mistake and never used it? Open it and click **Delete** (owner
  only) — that only works while it has zero sales, purchases or adjustments against
  it. Once a location has real history, use **Inactive** instead: it drops out of the
  picker everywhere but keeps its past records intact.

### Fixed assets and depreciation

On **Fixed assets**, choose how each asset loses value: the same amount every month (straight-line), or a yearly share of
the value it has left (reducing balance). Reducing balance suits vehicles, computers and machinery, which lose most
value early. The charge is a non-cash expense on your profit, the cash leaves once on the purchase date, and book value
never drops below the salvage value you set.

For land, buildings or anything you expect to gain value, put an **expected yearly rise in value %** on the asset (and,
for land, set the salvage value equal to the cost so it is not depreciated). The page then shows a rough market value
today and in 1, 3 and 5 years, and how far above the books it is. It is your own estimate for planning: your books and
tax figures stay at cost less depreciation, and nothing is revalued until you sell.

### Investing spare cash (optional)

If the business puts money into shares, treasury bills and bonds, unit trusts, fixed deposits or property, record
them on **Investments** (owner only; your manager and accountant can see them).

1. **Add investment**: give it a name and a type. Type in the latest price per unit if you know it. For a fixed
   deposit or a single asset, use 1 unit and put its current value as the price.
2. **Buy**, **Sell** and **Income** record what actually happened: units and price, any fees, and any dividend or
   interest received. Dates can't be in the future, and you can't sell more than you hold.
3. **Update price** whenever you check it. Nothing is fetched for you, so the page tells you when a price is missing
   or over 90 days old.

You see what each holding cost, what it is worth now, the gain so far, the income received and a yearly return
(shown once there are three months of history). "What it could be worth later" lets you choose a yearly return and a
monthly top-up; it is an assumption to plan with, not a forecast.

To plan ahead, put in a target (for example the amount you want to hold in five years) and the page shows the monthly
amount that gets you there, or how long it takes at your current top-up, on the return you chose.

In your books: buying and selling move cash (Investing section of the cash flow), dividends, interest and gains from
selling count as profit and are taxed with it, and holdings sit on the balance sheet at what they are worth now. The
difference from cost is shown as an unrealised gain until you sell. Balancr does not connect to a broker or any
authority, and it does not do tax filing for investments.

On **Fixed assets**, "What your equipment will be worth later" shows book value today and in 1, 3 and 5 years, the
depreciation still to be charged over the next 12 months, and which assets are fully depreciated within a year, so you
can plan replacements and set cash aside. Book value is an accounting figure, not what the equipment would sell for.

### Spending review (Expenses)

When you add or edit a **recurring** cost, say how important it is: **essential** (the business stops without it),
**useful** (helps, but could be reduced) or **optional** (nice to have, can be paused). The Expenses page then shows your
recurring costs per month split that way, how much you could free by pausing the optional ones, and how many you
haven't reviewed yet. When your cash map shows a squeeze, the advice quotes that optional amount. Staff pay is not
included, and the tag changes no numbers anywhere.

### Your next 13 weeks (Cash flow)

**Cash flow** now shows the next 13 weeks week by week: cash at the end of each week, what moves it (invoices coming due,
bills, loan instalments, payroll, recurring costs, rent), and which weeks are **OK**, **Tight** (cash drops under about
a normal week of outgoings) or **Cash runs out**. When a squeeze is coming it lists the fastest fixes: invoice sooner and
ask for deposits, stretch supplier terms, pause optional spending, and talk to your lender before a payment is missed
(ask for interest-only or a longer term, and get it in writing). Bills that are already overdue count as leaving
tomorrow. Customers who are already late are not counted as money coming in; the page tells you how much that is.

### Paying debts off faster (Loans)

On **Loans**, type an extra amount you could pay each month. You see the debt-free date and the interest for three ways
of paying: scheduled payments only, highest interest first (cheapest) and smallest balance first (clears loans soonest).
It assumes you keep paying the same total each month and roll a cleared loan's payment onto the next. Keep any loan that
is secured against something you own paid on time before anything else.

### What if interest rates rise? (Loans)

Below that card, **What if interest rates rise?** shows what your monthly debt payments would become if the rate on what
you still owe went up by 1, 3 or 5 points: the extra each month, the new total, and about how much more interest you would
pay by the end. If you have several loans it names the one that would cost most. It only matters for loans your lender can
reprice; a fixed-rate loan is unaffected. It is arithmetic on your recorded loans and changes nothing. If your lender does
change a rate, edit that loan's rate and your profit, cash flow and balance sheet follow.

### Does your pipeline cover this month's target? (Leads)

If you have set a revenue target for this month (Statements, Budget), **Leads** shows how many times your open leads cover
what you still need to earn this month: their estimated value divided by the target less what you have already sold.
About 3 times is the usual safe level because most leads are not won; under 1 time means you would miss the target even
if every lead closed. Leads may carry an expected close date (see Working leads below), but this check still compares all open leads with this month's gap: it checks that
there is enough in the funnel, it is not a forecast. It appears only when a target is set, the target is not yet met and
at least one open lead has a value. Owner, Manager and Accountant see it; Staff do not.

### Playbook: write down how things are done, and when contracts end (Team menu)

**Playbook** (Owner and Manager write; the Accountant can read) is where the business stops living in one person's head.

1. **Procedures.** Write the steps for anything repeated: opening and closing, taking an order, handling a return,
   month-end. Say who is responsible and, if you like, how often to re-read it (every 90 days, say). When a review is
   overdue the entry rises to the top and says so; **Mark reviewed today** restarts the clock.
2. **Contracts.** Record who it is with, when it ends or renews and how many days of notice you need. From the day the
   notice period starts the entry says **Act now**, so you can renew, renegotiate or end it before you are locked in; it
   warns 30 days before that. Write the key terms in your own words and keep the signed copy somewhere safe: this is a
   reminder, not the agreement, and Balancr does not draft or check legal documents.
3. **Print** any entry for a team member who does not have a login. Staff logins do not see the Playbook.
4. It changes nothing in your books. Every entry is in the full backup, and `playbook.csv` in the backup zip is a readable copy.

### Marketing by channel: which way of finding customers pays (Leads page)

Give each **Marketing** expense a channel (the same names a lead's or customer's source uses: Social media, Search / SEO,
Event / trade show, and so on; you can type your own). **Leads > Marketing by channel** then shows, for the last 1, 3, 6 or 12
months, for every channel: what it cost, the leads and new customers it brought, the cost per lead, the **cost per new
customer (CAC)**, the sales and profit from customers who came through it, and what came back per 1 spent. A channel whose
customers' profit is at least what it cost is marked "Paying for itself". Spend with no channel is reported underneath so you can tag it.
Each channel also shows **lifetime profit per customer**: the profit from every sale to all the customers that channel has ever brought, at any date, shared by all of them (a customer with no sales yet counts as nothing, so the figure is cautious). Divided by the cost per new customer, that gives the **lifetime profit ÷ cost per customer** ratio; 3.00 or more is the usual healthy mark, and under 1.00 means the customers do not repay what they cost to win.
A sale counts under the channel it was recorded with (a booking, a won lead, or a sale that names its channel). A sale with no channel of its own counts under the channel of the customer who bought it. Sales by channel on the Sales page uses the same rule, so the two reports agree. Only a sale with neither its own channel nor a known customer source shows as Not recorded.
It is read from records you already keep and changes no figure anywhere. A short period, or a channel with few customers, is a
rough guide: look at the trend over several months before you cut anything.

### Messages to leads and customers (Leads, Customers and Support pages)

Each lead, customer and support case has a **Message** link. It opens a ready-written message that fits (a first hello, a gentle
follow-up, questions to check a lead is worth a quote, a quote chase, a win-back, a thank-you, a referral ask, or a check that a
support issue is fixed). Edit it, then **Open WhatsApp**, **Email** or **Copy**. Balancr sends nothing and tracks nothing: it only opens
WhatsApp or your mail app with the text filled in. Every first-contact message includes an easy way to say no. The lead stage
**Qualified** is for a lead who has the budget, the authority, a real need and a timeline: send a quote only to those.

### Customer support log (Buy & sell menu)

**Support** (Owner and Manager write; the Accountant can read) keeps every complaint, question, refund or return request and
warranty or repair job until it is sorted out. Log who it is for, what it is about, how urgent, the date and who has it. Open
cases stay on top, urgent and oldest first, and one open more than 7 days is flagged as waiting. The page shows how many are
open, urgent and waiting, the average days to resolve over the last 90 days, and customers who came back with two or more cases
in 90 days, who are worth a phone call. A case can also carry a **Sort it by** date (optional): an open case past that day is flagged **past due** on its card and counted in the summary. The date cannot be before the case was opened, and it is dropped once the case is resolved. **Mark resolved** records the date and what was done; **Reopen** puts it back. A refund or
replacement is still recorded where the money or stock moves (a sale return, a stock adjustment): the log changes no figure. Staff
logins do not see it: they tell the owner or manager, who log it. It is in the full backup (and `support_cases.csv`).

### Find prospects (Leads page, Owner and Manager)

**Leads > Find prospects** looks up businesses of one kind in one place on **OpenStreetMap**, a free public map: no account, key or deposit. Pick the kind
(plumbers, restaurants, salons, hardware shops, clinics, garages and so on), type a city or district with the country (for example *Dehiwala, Sri Lanka*), and
press **Search**. You get up to 100 businesses with the phone, email and address the map lists for them. Businesses you already have as a lead or a customer are
marked and cannot be added again; the ones you can reach and do not have yet are ticked for you. Untick any you do not want, then **Add as new leads**: they
start at *New* with the source *Cold outreach*, and the note records the kind, address, website and that they came from OpenStreetMap. Three limits to know.
Only businesses someone has put on the map appear, and many list no phone number, so treat it as a way to start a list, not a complete directory. A whole region or
country is refused: name a city or district. And each business gets 15 searches a day, because the map service is free and shared. Balancr contacts nobody and
does not visit the businesses' own websites: you decide whom to message and how (see Messages above). Map data © OpenStreetMap contributors.

### Write with AI: first messages, follow-ups and post ideas (Owner and Manager)

First tell Balancr what you sell: **Settings > What we sell**, two or three plain sentences (what, to whom, why it is worth buying). Then:
- On a lead's **Message** window, **Write with AI** drafts a first message (for a *New* lead) or a follow-up (for any other open stage) for that person, using the
  stage, the source, your notes about them and how late their follow-up is. The draft appears in the text box: read it, change it, and send it yourself with
  WhatsApp, email or Copy. Every lead message ends with an easy way to say no, and a draft that uses false urgency ("last chance", "act now") is thrown away.
- **Leads > Post ideas** writes three social post ideas (a hook, a caption and what picture to use) for a goal you pick, optionally about one thing you want to push.
  Copy what is useful. Balancr does not post, schedule or measure posts.
Each press uses one of your daily AI messages (the same allowance as the Assistant), and the description of what you sell is sent to the AI provider with it. If the AI
is busy you are not charged a message. Nothing is ever sent or saved by this.

### Sales below cost (Profit page)

- **Limits of camera scanning.** It works only in browsers that can read barcodes (Chrome on Android and similar), and only for items with a code (SKU or barcode) typed on them. It picks an item only on a single exact match; two items with the same code are never guessed. Nothing is stored from the camera.
- **Scan with camera.** On a phone or tablet whose browser can read codes (Chrome on Android and similar), the sale form shows **Scan with camera**. Point the camera at the item's barcode or QR code and it picks the item. The camera is on only while the box is open. Where the browser cannot read codes, use a scanner or type the code as before.

At the top of **My Profit**, the last 90 days of sales that brought in less than they cost (the goods plus the per-sale costs, after any discount): how many, how much
was lost, how many were discounted, and which items and customers it keeps happening with. Returns and sales made without the stock in hand are left out, so what is
left is a pricing choice. Selling below cost does not become profit by selling more: raise the price, cut the discount, or drop the item. It changes no figure and blocks no sale.

### Operations: approvals, procedures, compliance, incidents, equipment, KPIs and reviews (Operations page, Team menu)

**Operations** holds the running of the business that is not money. It has seven tabs, and you see the ones your role may open. Owner and Manager see all seven. Staff see Requests, Procedures, Incidents and Equipment. The accountant sees Compliance and KPIs. Nothing on this page posts to the books or moves stock. Each record is a note that helps the business run; the money side is still recorded where it always was.

**Requests.** Anyone who works in the business can ask for a spend before it is bought, claim money they paid themselves, or ask for a shift change. Each request says what it is, when, how much (not for a shift change), and any detail. An Owner or Manager approves or declines it. The requester can withdraw a request that is still waiting, and nothing can change once it is decided. An approved spend is still recorded on the Expenses page when it is paid. An approved expense claim is paid back the same way, and **Mark paid back** only notes that you did it. The Owner sets a **manager approval limit** on this tab: a Manager may approve a spend or claim up to that amount and no further. Set it to 0, or leave it empty, and only the Owner decides. A shift change has no amount, so any Manager can decide it. The tab shows how many requests are waiting, the value in them, and how long the oldest has waited.

**Procedures.** Write down how an important job is done, step by step, so anyone can follow it. An Owner or Manager writes each procedure. Every operating team member is asked to confirm they have read the current version. Changing the title or the steps makes a new version, and everyone is asked again; the people who already read the old one are not treated as having read the new one. Changing only the review setting does not make a new version. A procedure can have a review cycle, in days; when it falls due it is marked **Due for review**, and ticking *I have checked it today and it is still right* resets the cycle without changing the version. Owners and Managers see how many people have still to read each version and who they are. The accountant does not confirm procedures. Procedures are kept separate from the Playbook: the Playbook is the owner's own notes and contract dates, these are for the team.

**Compliance.** A register of licences, permits, insurance policies, certificates, staff training, leases, contracts and registrations, each with its expiry date. Items turn **due soon** 30 days before they expire (or the number of days you set) and **expired** once the date has passed. The register lists the expired items first. Each item can hold a link to its document. Balancr keeps a link to the document, not the file, so put the file where you keep papers (Drive, Dropbox, the supplier's site) and paste the https link. Items inside their reminder window show on the Agenda.

**Incidents.** Report a near miss, an injury, damage or breakage, or a customer incident, with the date, place, how serious it was and what happened. Anyone who works in the business can report one and sees the reports they made. An Owner or Manager sees all of them, records what was done about each, and marks it closed or reopens it. The tab shows the open incidents, flags any open for more than 14 days, and counts the near misses in the last 90 days. Report near misses as well as accidents: the near miss is the warning.

**Equipment.** Vehicles and equipment, each with how often it needs a service: every so many days, every so many kilometres, or both. The item shows its state (never serviced, on schedule, due soon, overdue), when the next service falls due by date and by distance, and its recent services. Anyone who works in the business can log a service done with its date, the reading on the odometer where there is one, what was done, and a cost if you want to keep it. The cost is a note for your own records. A service posts no expense; if you paid for it, record the bill on the Expenses page too. A distance service is only judged once there is a current reading. A service logged cannot be dated in the future, cannot have a reading lower than the last one, and each item keeps at most 200 services. Services with a date show on the Agenda.

**KPIs.** Choose the few numbers that show whether the business is on course, for example orders delivered on time, days with stock-outs, or table turns per evening. Give each one its unit, its target, whether higher or lower is better, and whether you record it each week or each month. Record a figure for any day in the period; a figure already recorded for that week or month is replaced. The tab shows the latest figure, whether it is on target, which way it moved since the last one, and the last few figures. The newest 260 figures are kept for each measure, so older ones are dropped. Changing how often a measure is recorded keeps the figures already entered, filed by the old period.

**Reviews.** Performance reviews for the people on the payroll list. Only the Owner and Manager can see them: staff and the accountant cannot. A review has a date, an overall rating from 1 to 5, what is going well, what to improve, up to 10 goals with an optional due date and a done box, and an optional date for the next review. Balancr flags each person who has never been reviewed, and each whose last review is six months old or past the date set in it.

Limits, stated plainly: nothing here posts to the books or moves stock; a service cost, a KPI figure and a review are notes; a manager approval only records the decision, and the money is still recorded when it is paid or claimed. Balancr sends no message from any of it. The record of who read which procedure version is kept with the procedure, and it is removed if the procedure is deleted.

### Weekly scorecard (Routines page)

At the top of **Routines**: sales, sales made, new leads, new customers, support cases opened and resolved, feedback answers and the average score, for this week
so far (Monday to today) against all of last week, plus how many lead follow-ups are overdue and how many support cases have waited over 7 days. Early in the week
the numbers are smaller because the week is younger: wait until Sunday before reading a drop. It counts only what you have recorded.

### Customer feedback: would they recommend you? (Buy & sell menu)

**Feedback** (Owner and Manager write; the Accountant can read) keeps one number per customer: the answer to "how likely are you to recommend us
to a friend or colleague, from 0 to 10?". Ask a week or two after a sale (the **Ask** link on the page writes the message for WhatsApp or email),
then **+ Log an answer** with the number, the date and, if they gave one, what they said. 9 and 10 are fans, 7 and 8 are neutral, 6 and below are
unhappy. The **score** is the share of fans minus the share of unhappy customers over the last 90 days (from -100 to +100), shown against the 90 days
before. With fewer than 10 answers the page calls it a first impression, not a score: keep asking. Three lists do the work: **Get back to these customers**
(low scores nobody has followed up, with a reply message and **Mark followed up**), **Ask these customers next** (people who bought in the last 60 days
and have not been asked in 6 months), and **Happy customers: ask for an introduction** (recent 9s and 10s, with the referral message). It changes
no figure and sends nothing. Staff logins do not see it. It is in the full backup (and `feedback.csv`).

### Bookings: appointments and reservations (Bookings page, Buy & sell menu)
Use it for anything sold by the time or the seat: appointments, a chair, a room, a tour, a table. Tap **New booking** and enter the customer, what is booked, the day, the start time and the length. The **With** box is the person, room or chair it is for; leave it blank if you have one shared lane.
- **A clash is refused.** If the same resource is already booked at an overlapping time, saving stops and tells you who is in that slot. A booking that ends exactly when the next one starts is fine.
- **Statuses:** Booked, Done, No-show, Cancelled. Use Done, No-show or Cancel on a booking from its row. Only booked ones block a slot, so cancelling frees the time at once.
- **Deposit:** record the amount paid in advance to see what is held. It is not posted to your books; take the money in Sales or Money owed as you normally would.
- **The week strip** shows bookings and hours for each day of this week. The summary shows bookings still to come, deposits held, the no-show rate, and cancellations over the last 90 days.
- **Seasonal demand** (by month and by weekday) appears once you have a full year of bookings, so one busy month never looks like a pattern.
- Staff can book and move bookings (they serve the customer); only the owner or a manager deletes one. Nothing is sent to the customer.
- **Record as sale.** When a booking is finished, mark it **Done**. It then appears under **Done, not yet a sale**, where **Record as sale** turns it into one sale: pick the service given, check the price charged, and choose how it was paid. The sale is saved and the booking is linked to it in one step, so either both happen or neither does. The sale then appears on the Sales page with the customer and a note of which booking it came from.
- **Sale not recorded yet.** A Done booking, or a Won lead, with no sale recorded appears in Notifications. It is a reminder only: open the Bookings or Leads page and press Record as sale. At most 20 reminders show at a time.
- **Booking reminders.** A booking still marked Booked that starts within the next 24 hours appears in Notifications as "Booking coming up". Within two hours it is high priority. Done, cancelled and no-show bookings never remind.
- **Limits.** These are deliberate, so the books stay right:
  - One sale per booking. A booking with a sale stays Done, and it cannot be deleted.
  - A sale can only be recorded once the booking is Done, and not for a booking still in the future.
  - Services only. A stocked product is not sold through a booking, so no stock moves.
  - The price must be above zero and no more than 1,000,000,000.
  - Credit is not offered here. Record a credit sale on the Sales page.
  - How they came in is optional. Give it (Walk-in, Online, a referral…) so the sale counts in Sales by channel and in channel economics. Blank is recorded as Not recorded.
  - A deposit is not posted separately, so the sale records the full price. A deposit already taken is noted on the sale.
  - The Done list shows the most recent 50 bookings that have no sale.
  - Deleting the sale later on the Sales page puts its booking back under "Done, not yet a sale", so it can be recorded again.
  - Bookings link to customers by name only, so a sale is matched to a customer by the name typed.

### Delegation: who has what, and what is overdue (Delegation page, Team menu)
Hand work to someone and track it. Tap **Hand over a task**, write what needs doing, pick a team member or a freelancer or contractor (no login needed), and add a due date and an urgent flag if it matters.
- **Overdue work rises to the top**, then urgent work, then the rest by due date, then what is done (newest first).
- **Who has what** lists each person's open tasks, overdue tasks, and what they got done in the last 30 days, so you can see who is carrying the most before it becomes a problem.
- **Mark done** ticks a task off with today's date; **Reopen** undoes it.
- **Checklist.** Add up to 30 steps to a task when you hand it over (or when you edit it). The team ticks steps off on the task list, and the task shows how many are done. Ticking a step does not close the task.
- Nothing is sent to the person. You (or a manager) tell them. Owner and Manager set and change tasks; the accountant can read them; only the owner deletes.
- Tasks are records of work, not money: no figure in your books changes.

### Freelancers and outside workers: attendance (Time page, owner and manager)
Freelancers and contractors do not need a login to be tracked. On the **Time** page, press **+ Log for someone**, and in **Team member** choose **Freelancer or contractor (no login)**. Type their name, then the day, start, end, the job or customer, and an hourly rate if you want their hours costed to a project.
- The same person's hours add up across days when you use the same name (capital letters and extra spaces do not matter). Names in Sinhala or Tamil work.
- Their time is costed exactly like a team member's. Nobody outside the business can sign in as them.
- If two different people share a name, give them different names (for example "Nimal K" and "Nimal S"), otherwise their hours will be added together.

### Rentals: things lent or hired out, and their return (Rentals page, Buy & sell menu)
**Who can use it.** Owner and Manager record and return rentals. Accountant can read the page. Staff do not see it, because deposits are an owner and manager matter.

**Recording one.** Press **New rental** and fill in what is going out, who is renting it, the day it goes out, the day it is due back, and the rate per day. Choose the service the rent is recorded under (for example "Rental income"; add it on the Products page first if the list is empty). A **deposit** is optional: it is money the customer paid up front, recorded as a customer deposit (not as income) the day you record the rental. The rented item is not stock, so nothing is taken off the shelf.

**Marking it back.** Press **Mark returned** on the rental. Choose the day it came back. Balancr shows the rent: each day out counts, from the day it left to the day it came back, at the rate per day. A late return costs more on its own, so there is no separate late fee to remember. If it came back damaged, enter a **damage charge** and what was damaged; it is recorded as its own sale. If there was a deposit, the box shows what to give back: the deposit less any damage charge. You can change it. Whatever you keep stays a customer deposit balance until you apply it to the damage invoice (Customers, Deposits), so it is counted once. When you record the return, the rent and any damage are posted as sales and any refund is recorded, all at once: either all of it is saved or none of it is.

**Overdue.** A rental still out past its due-back day is flagged in red on the page, counted in **Overdue**, and raises a reminder on the Notifications page. It keeps counting rent each day until it comes back.

**Changing or deleting.** You can edit a rental while it is out. The deposit amount cannot be changed once taken; delete the rental and add it again to change it. A rental that has come back cannot be edited or deleted, because its rent and any refund are already in the sales and deposits.

**What it does not do.** It does not track which unit of an item, nor a serial number; keep those in the notes. It does not add sales tax on its own beyond what is set for sales (the same rate applies to rent and damage when sales tax is on). Rentals are in your base currency.

### Team entries to check (Dashboard, owner and manager)

Set the amount under **Settings > Team entries to check, and loyalty points**. Any discount, expense, sales return or cash refund that a staff member, manager or accountant enters above that amount is listed on the Dashboard as "To check". Press **Looks right** when you have seen it. Nothing is reversed or blocked; the list only makes sure big entries are looked at. Entries you made yourself are not listed, and neither are old entries made before the maker was recorded (expenses record who entered them from now on).

### Loyalty points (Customers page)

Set **Loyalty: one point for every amount a customer spends** in Settings, for example 500. Each customer then shows their points and how much more they need for the next one. Points come from what the customer has bought, net of their returns and discounts, so a return takes its points back. Nothing is stored or reversed by hand. To give a reward, record it as a discount with the reason **Loyalty** on the sale.

### Agenda: what needs you this week (Agenda page, Overview menu)

The **Timeline** at the top of the Agenda page shows the next 14, 30 or 60 days as bars: one per project (from its start date to its target end, or to the day it completed) and one per task with a due date (from the day it was handed over to its due date). Overdue bars are marked, and finished ones are faded. It is a view only.

One list of everything with a date that needs you soon: tasks due, rentals due back, shipments expected, bookings still booked, lead follow-ups, open support cases and project dates. Overdue items are at the top. Choose 7, 14 or 30 days ahead, and press **Open** on any line to go to the page that handles it. The Agenda only reads; it changes nothing.

Renewals and services join the Agenda as well. A licence, permit, insurance policy or other compliance item is listed from the start of its reminder window (30 days before it expires unless you set another number) and on the day it expires, and an item of equipment with a date-based service is listed on the day its next service falls due. A distance-only service has no date, so it is shown on the Operations page, not here. Press **Open** on either line to go to Operations.

### Customer history (Customers page, History button)

Press **History** on a customer to see, newest first, everything that has happened with them: sales, money paid in advance and gift cards, rentals out and back, bookings, support cases and payment contacts. Customers are matched by name, as elsewhere in the app.

### Deal finder: work these next, and paste a list (Leads page)

**Work these next** at the top of the Leads page lists your open leads (not won, not lost) in the order they are worth working. Each lead's expected value is its estimated value times how often leads from its source are won. A source is judged only after three of its leads have been won or lost; until then it counts at a quarter. Each lead shows a score out of 100 and the plain reasons behind it: a contact (or none), an estimated value, the source's win rate, how far along it is, follow-ups that are overdue, due today or this week, and whether it came in during the last two weeks.

**Paste a list** adds leads from a list you already have. One lead per line: name, contact, source, estimated value, notes, separated by commas or tabs. A first line that names the columns (name, phone, source, value and so on) is read as the header. **Check the list** shows how many leads are new, how many are already on your list (skipped), and any line with a problem, which must be fixed first. Nothing is added until you press Add. Balancr does not fetch lists from other websites: every lead comes from you, or from the open-data **Find prospects** search above.

### Pipeline: moving leads between stages (Leads page)

Leads are grouped by stage. Drag a lead onto another stage to move it. The stage menu on each lead does the same thing, and works on a phone where dragging does not.

**Follow-up dates.** When a lead moves to Contacted or Following up, its next follow-up is set three days out (five for a proposal), unless you already set a date. Change it or clear it any time.

**Why leads are lost.** The Lost section lists the reasons typed on lost leads, most common first. Reasons match ignoring case and spacing. A lost lead with no reason counts as "No reason given". It only summarises what you typed; it changes no lead.

**Possible duplicates.** Typing a name or phone or email that matches a lead or customer shows a warning on the lead form. It never stops you saving, because two people can share a name. Phone numbers match on their last nine digits, so 077… and +94 77… are the same number.

**Record as sale.** When a lead is Won, **Record as sale** turns it into one sale: pick what was sold, check the price (it starts from the lead's estimated value, or the product's price), choose how it was paid, and say how they came in. The sale is saved and the lead is linked to it in one step. Balancr never counts the estimated value as revenue on its own.

**Limits.** These keep the books right:
- One sale per lead. A lead with a sale stays Won, and it cannot be deleted.
- Only a Won lead can be recorded. The sale is dated today, for one unit, paid in full (cash, card or bank transfer).
- Credit is recorded on the Sales page.
- Deleting the sale later on the Sales page puts the lead back to Won, with no sale, so it can be recorded again.

### Working leads: contacts, owners, sequences and timing (Leads page)

The **Leads** page now keeps a record of what happened with each lead, not just its notes. Use **Log contact** on a lead to write down a call, WhatsApp message, email, meeting or visit, and what came of it: no answer, left a message, spoke with them, meeting or visit agreed, not interested, or asked us to stop contacting them. You can add a short note. The contact is added to the lead's history; the lead's stage and value do not change.

Balancr never contacts a lead on its own. Making the call or sending the message is always your job; the log only records it. A lead keeps at most 200 contacts. Contact notes are capped at 500 characters, so put anything longer in the lead's notes.

**Filter chips** above the pipeline show all open leads, only the ones you own (Mine), only the ones with no owner (Unassigned, Owner and Manager), the ones whose follow-up date has come (Follow-up due), or the ones nobody has contacted yet (Not contacted yet). The counts and totals above are not changed by a filter.

**Owners and managers** choose who is working a lead in the lead's form (Who is working this lead?). A staff member can log contacts on the leads they created or that are assigned to them, and sees no other leads. Staff cannot change a lead's stage, value, owner or notes.

**Response time** (Owner and Manager) is the median time from a lead's date to its first logged contact, across the leads that have one. It is only as good as the log: a call you made but did not write down does not count. The same panel flags new leads with no contact after 24 hours.

**Follow-up sequence.** Press **Start follow-up sequence** on an open lead to plan five touches over three weeks: a first contact on day 0, a message on day 2, a second call on day 5, an email on day 10 and a last check-in on day 21. The lead's next follow-up date becomes today. When a step is due the lead shows which step it is and how many days late it is, with **Log this step**. That opens the contact log with the step's channel already chosen and ticked as the step, so logging it moves the sequence on. The sequence stops by itself when the lead is won, lost or marked do not contact. Only one sequence can run on a lead at a time; once all five steps are logged it shows as complete, and you can start another.

**Team** (Owner and Manager) shows, for each person, how many open leads they own, how many follow-ups are due today or earlier, and how many contacts they logged in the last 7 days. Contacts logged with no person named appear as Unknown.

**Expected closes** (Owner and Manager) groups open leads by their expected close date: passed, this month, next month, later, or no date. Each group shows its estimated value. The date is a guess you make; it changes no revenue, and the value is still never counted as revenue.

**Do not contact.** When someone asks you to stop, log "Asked us to stop contacting them", or tick Do not contact on the lead (Owner and Manager). That lead then gets no message button, no sequence and no further contact attempt. Only the stop itself can still be logged. Only an Owner or Manager can clear the flag again. Do-not-contact leads are never counted as untouched and never appear in the lost-leads revisit list.

**Lost leads to look at again.** A lost lead can have a revisit date ("Look at it again on", Owner and Manager). When that day comes it appears in the Leads page's list of lost leads to look at again. Press **Looked at it** to clear it once you have. A revisit date changes no stage; move the lead yourself if it comes back.

**Where a lead came from.** A lead from the website enquiry form shows the campaign tag of the link the visitor followed (utm_source and utm_campaign), the website it was referred from, and what they said when asked how they heard of you. These are recorded only when the link or the browser provides them, and nothing else is tracked. Leads from elsewhere show only the source you chose.

Limits, stated plainly: logging a contact, starting a sequence and setting an owner or a close date change no money, no stock, no stage and no revenue. Balancr sends no message from any of them. A sequence step is a reminder of what to send and when, not a message.

### Shipments: goods on their way, and proof of delivery (Shipments page, Buy & sell menu)

Use this for imports and supplier deliveries that travel. Record each shipment by its waybill, airway bill, bill of lading or tracking number, with the supplier and the route. Move it on as it reaches each stage: booked with the carrier, on its way, arrived at the port or hub, cleared customs, delivered. Each stage asks for the day it happened. The page lists what is still on the way, puts anything past its expected day at the top as overdue, and shows deliveries in the last 30 days and the average days from departure to delivery.

Delivery needs the name of the person who received it. That is your proof of delivery, and you can add the delivery note or signed waybill number too. Balancr does not fetch anything from the carrier, so you update each stage yourself. Freight and customs costs still go on the purchase or the expense, so no money figure changes here. Owner, manager and staff record shipments, and only the owner or manager deletes one. The shipments are in the full backup as `shipments.csv`.

### Importing a list of prospects (Import / export, owner only)

If you have a list of people or businesses to contact (from a directory, an event sign-up sheet, a partner, or your own
contacts), **Import / export → Leads & prospects → Import CSV** adds them all as **New** leads, ready for outreach and
follow-up on the **Leads** page. Column names are matched loosely, so a list from another tool usually imports as it is:
a name or business name, a phone or email, and optionally a source, an estimated value and a next follow-up date
(written like 2026-11-05). Anyone already in your pipeline with the same name and contact is skipped, not added twice, and
it tells you how many. If any row has a problem, nothing is added and you are told which rows to fix. Up to 500 per file.
For a quick start without a list, use **Find prospects** on the Leads page (next section). Either way, use only businesses you are entitled to contact.

### Lending money and earning interest (optional)

If the business lends money (to a customer, a staff member, another trader, or equipment sold on instalments),
record it on **Money lent out** (owner only; your manager and accountant can see it). This is the opposite of
**Loans**, which is money the business borrowed.

1. **Lend money**: who borrowed, how much, the yearly interest rate, how many monthly payments, and whether they pay
   equal monthly amounts or only the interest each month with the full amount at the end. The page shows the monthly
   payment and the interest you would earn before you save. The amount leaves your cash on that date.
2. **Record payment** whenever the borrower really pays. A payment covers the interest owed first, then the
   principal, and the form shows that split before you save. **Settle in full** fills in exactly what is owed that day.
3. **Write off** only when you decide you will never collect. The principal you give up is a loss in that month, no
   cash moves, and any unpaid interest on it is dropped. Deleting the entry undoes it.

You see what is still owed, the interest earned, who is late and for how many days, what is due in the next 12
months, and a yearly return once there are three months of history. **Is lending worth it?** compares what you are
owed with what the same cash could earn elsewhere (you choose that rate). Late borrowers also appear in
Notifications.

**Customers gone quiet.** A customer who used to order on a regular rhythm, and is now at least twice their usual gap since the last order, is raised once on Notifications as "Customer gone quiet", with the most overdue first (up to 20 at a time, the longest quiet first) and priority high once they are three times their usual gap. Open the customer on the Customers page to send a win-back message. Marking it read stops it coming back for that same lapse; if they order again and then go quiet again, it is raised again.

In your books: lending takes cash out, repayments bring it back, the interest part counts as profit **when it is
received, never before** (interest that is owed but unpaid is shown separately and stays out of profit, tax and
cash), and what is still owed sits on the balance sheet as "Money lent out". Pay on the agreed dates and the figures
match the schedule exactly; pay late, early or short and the interest follows what really happened. Closing the books
for a month also locks lending entries in that month. Balancr does not check borrowers, contact them, or connect to
any bank, credit bureau or authority.

### Collections: chasing money you are owed

**Collections** (under Money) is one list of everyone who owes the business money and is late, or falls due this week:
customers with open invoices and borrowers on **Money lent out**. It works the same whether you run a shop with a few
credit customers, a distributor with reps on the road, or a lender collecting instalments.

- **Ranked for you.** Most urgent first: a broken promise, then a follow-up that has come due, then someone nobody has
  contacted, then people you have spoken to, then people who promised and are being left alone, then payments only
  falling due this week. Inside each, the longest late and largest amount come first.
- **One tap to nudge.** *Remind on WhatsApp* opens your own WhatsApp with the message written (firmer after a broken
  promise, gentle for something only falling due). *Call* opens your phone. Nothing is sent by Balancr.
- **Log contact** after every call, message or visit: how it went, whether they promised to pay (date, optionally how
  much), and when to try again. A promise that passes with no money received shows as **broken** and jumps to the top;
  money received after they promised clears it, so good payers are never nagged. A diary line can't be edited, only
  deleted by the Owner, so it stays an honest record.
- **Record payment** on the same card. The money still has to be recorded when it really arrives; logging a contact
  books nothing.
- **Borrower record.** Customers can carry an address, an ID or registration number (only to tell two people with one
  name apart), a guarantor and a collector. A loan can also carry the borrower's phone, a guarantor, and what backs it
  (collateral). Picking a borrower from your customers brings their phone along, and a new borrower can be added to your
  customers in the same step.
- **Field officers and collectors.** The Owner can assign any team member to chase a customer or a loan. On the payment
  form, **Collected by** credits a payment to whoever really went and got it (it defaults to the assigned collector). The
  scoreboard on the Collections page shows, per person: what is assigned, what is late, what needs a move today, broken
  promises, contacts logged and what they collected this month. Work with nobody assigned is shown too.

Who sees what: Owner and Manager log contacts and record payments; only the Owner assigns collectors, records loan
payments and deletes diary lines; the accountant can look but not change anything. A Staff login does not see
Collections or the loan book (it still records payments on its own credit sales from the Sales page, and those count as
collected by them). Balancr does not message anyone, schedule calls, check borrowers, or connect to any bank, bureau or
authority.

### Routines: is the business running its rhythm? (Money menu)
A short, fixed list of the habits that keep your books honest, each checked against your records, so it cannot be ticked without the work being done: the cash counted this week, every overdue customer contacted in the last 7 days, nothing owed to suppliers past due, no bank line left unmatched for over a week, stock counted in the last 35 days, and last month closed once reviewed. A check appears only if you use what it checks (no cash sales, no cash routine). "Not set up" means you have not started that habit yet and is never counted as a problem. Each check has an **Open** button that goes to the page where the work is done. The Dashboard shows one line when something needs attention. Owner and Manager only. It changes nothing and is not a task manager: how work is done, and who does it, belongs in a document.

### Stress test: what if a bad stretch hits? (Financial health)
Two dials, **Sales change (%)** and **Costs change (%)**, applied to your last three complete months (the month still running is ignored). It shows, next to today's figures: monthly profit, net margin, the sales you need each month to break even, how far above that you are, and how long the cash on hand would last if the case turned into a loss. Three presets are one tap away: "A bad stretch" (sales -20%, costs +10%), "Costs +15%" and "Lose 30% of sales". Use it for a currency move, a power-tariff rise, a lost customer or a supplier price increase. It is a model, not a forecast: sales volume moves the cost of goods and variable costs with it, a cost rise lifts cost of goods, variable costs and operating expenses (the selling price stays put), and interest and depreciation are held. Nothing is saved and nothing in your books changes. It needs at least one complete month with sales.

### Stock over time (Financial health)

**Financial health** shows what your stock was worth at the end of each of the last 12 months, how much cash is tied
up in items that have not sold for 90+ days, and which items will run out within 30 days at the recent selling pace.
It is worked out from your purchases, sales, returns and stock adjustments, so there is nothing extra to enter.

### Selling a share of the business (optional, owner only)

If you are thinking of taking an investor's money in return for a share of the whole business, open **My Profit →
Selling a share of the business**. Unlike a loan, this money is never paid back with interest, but everyone who owns
a share today ends up with a smaller percentage. This shows how much smaller before you agree anything.

1. **Who owns the business today**: add yourself and anyone else, with a number of shares each. If you have never
   counted shares, use 100 so that each share is 1%. Save.
2. **What if I sell a share?** Type what you think the business is worth before the new money, how much you want to
   raise and the investor's name. You see the price per share, the new shares, what the investor ends up owning, and a
   before/after table with what each owner gives up. A warning appears if the investor would own more than half or an
   owner would lose their majority. The strip of buttons underneath shows how much money giving away 5% to 30% would
   bring in, and tapping one fills in the amount.
3. **Does the valuation hold up?** The same screen compares your number with your own sales, profit after tax and
   balance sheet over the last 12 months. It is a sanity check: an investor will compare those figures with what
   similar businesses sell for.
4. **Where the money will go**: list each use and its amount. It shows whether the list adds up to what you are raising.
5. **Record this raise** once the deal is agreed. The owners list updates, the raise is added to the history, and
   (unless you untick it) the money is recorded as cash received in the same step, so you can never have one without
   the other. A closed month refuses it.

This is a working record and a planning tool, **not a legal share register**. Nothing is filed anywhere, no registry or
authority is contacted, and no money moves. The investor's rights depend on the agreement you sign, and the company
paperwork and any rules about raising money are for your lawyer or accountant. Raising money from the public, listing
on an exchange or selling shares through a broker are outside what Balancr does.

### Investor pools: other people's money in a property or land project (optional)

If you raise money from other people to buy one investment (a plot of land to resell, a rental property) and pay them
a percentage of the profit, use **Investor pools** at the bottom of **Investments** (owner only).

1. **Add the investment first** (for example "Kandy land", type Property) and record the purchase with **Buy**, fees
   included. Type in its current value with **Update price** whenever it changes, so you can see how much it has grown.
2. **Add investor money** for each person: their name, the amount and the date. Each person's **share** is what they put
   in divided by everything put in. Spell the name the same way each time (capitals and extra spaces don't matter).
3. When the land sells, record the sale with **Sell**. The pool then shows the profit that hasn't been paid out yet.
4. **Pay out**: choose a **Dividend** (split by share) or **Money back** (each person's capital, split by what they are
   still owed). You see exactly who gets what, to the cent and adding up exactly, before anything is saved. Then send
   each person their money yourself. Balancr only records it.

Each pool shows what was raised, what the pool is worth now, what has been paid out, the pool's profit, and for every
investor their share, dividends, capital back, what their stake is worth today and their return. A person's share does
not change when their money is paid back. If someone joins later, they take a share of the whole pool, so agree terms
with them first.

In your books: the money investors put in is cash in and is not income or profit. Dividends and money paid back are
cash out of the business's equity. They are not an expense, so they don't reduce profit. Investor payouts are kept out
of the "owner withdrawals" warnings. A closed month can't take a payout. Balancr does not connect to a bank, a land
registry or any authority, and it does not file anything. The legal terms with your investors, and any tax or
registration rules for raising money from the public, are yours to settle with your lawyer or accountant.

### Foreign-currency exposure (Money owed)

If you sell to customers or buy from suppliers in another currency on credit, **Money owed** shows a **Foreign-currency exposure** card for each currency: what customers still owe you, what you still owe suppliers, and the net. Everything is valued at the rates you typed when you booked it. Pick 5%, 10% or 20% to see what the net position would gain or lose if that currency got stronger or weaker against your own. Money you are owed gains when the currency strengthens, money you owe costs more. It is a what-if, and nothing on it is posted to your books. (When you pick a foreign currency on a sale, purchase or stock entry, the rate box is filled from the same free daily rate. Check it against what you actually paid or received, and type over it if it differs. A saved rate is never changed by this.) A **Reference rate today** box on each currency shows the free daily rate (from Exchange Rate API, which the card credits) and what the same unpaid balance would be worth at that rate, next to what the books say. Your booked rates are never changed by it. If the reference rates can't be loaded, the card still shows the booked figures. It disappears when nothing unpaid is in a foreign currency. Opening balances carry no currency, so they are not included.

### What if I change my prices? (My Profit)

Open **What if I change my prices?** on **My Profit**, pick -10%, -5%, +3%, +5% or +10%, and see for each item what the change would do to profit over the period you have selected, if the same quantity sold. The line under each item is the useful one: after a rise it says how much of its sales you could lose and still earn what you earn today; after a cut it says how much more you would need to sell. It cannot know how your customers would react, so use it to judge whether a rise is a safe bet. An item that would stop covering its own cost at a price is flagged.

### Making what you sell: bill of materials and production runs (Products page)

**Setting up a made item.** Open the product and give it a **bill of materials**: the inputs it is made from (raw materials, or other made items), and how many of each go into one unit. Stock of the inputs is then used up when you make it, and the finished units are added to stock at what the inputs and labour cost you. Owner and Manager set this up.

**Recording a run.** On the product, press **Make** (the production form). Enter the good units made, and any **scrapped in the run**: units spoiled during the run. Scrap uses up its inputs too, and their cost is spread over the good units, so the cost of each good unit is honest. Add labour or overhead per unit if it applies. The form shows the components each run uses and warns if the stock on hand would go below zero. A run is recorded in full or not at all.

**Can make now.** The production form shows how many units the stock on hand can make right now, and which input runs out first.

**Multi-level recipes.** A bill of materials can use a made item that has its own recipe (a sub-assembly). The production form then plans the whole run: a line **Make these first** lists the sub-runs to record, in order, before the run itself, and any raw material still missing across all the levels is named. Record the sub-runs one at a time with their own Make, then the finished run. A recipe that leads back to itself, such as A uses B and B uses A, cannot be saved, and a recipe can nest at most eight levels deep.

**What to make now.** The top of the Products page lists made items that have fallen below their minimum stock. Each is sized to the gap and to what the inputs allow. Items the inputs cannot make yet are listed with the input that is out. Press **Make** to record that run; each press asks first, and nothing is made without it. Staff do not see this.

### Tax rate for one item, and wholesale prices (Products and Customers)

If you charge sales tax (VAT/GST) and some items are taxed differently, open the item on **Products** and fill in **Tax rate for this item**. Leave it empty to use your shop rate, or enter 0 for an item that is tax-free. A sale or purchase of that item entered from then on uses its rate, and an invoice with several items taxes each line at its own rate. Past sales and purchases keep the tax they were saved with, and your Tax summary only ever adds up what was saved. Delivery charges and expenses always use the shop rate.

For wholesale, put a **Wholesale price** on the item and tick **Wholesale customer** on the customer. When you sell to that customer, the form shows the wholesale price with a **Use it** button (on an invoice, **Use wholesale prices** fills every line that has one). It only suggests; the price on the sale is whatever you enter.

### Eco and sustainability tags (Products and My Profit)

On the product form, fill in **Eco and sustainability tags** with the words separated by commas, such as Vegan, Organic, Recyclable packaging. Pick from the suggestions or type your own. On **My Profit**, the **Eco and sustainability mix** card then shows what share of the period's sales revenue came from tagged products, and how much came from each tag.

Limits. A tag never changes a price, a cost or your profit. It is a label for reading. The share counts only sales in the period you picked. A product with two tags counts in both lines, so the lines can add up to more than the tagged total. A sale with no revenue figure yet is left out. Leave the box empty to remove the tags from a product.

### Promo campaigns on the Sales page

On the **Sales** page, **Promo campaigns this month** treats each promo code as a campaign. For each code it shows the sales that used it, their revenue and gross profit, what the code took off, and the spend you typed for it under Settings (**Promo campaign spend**). It also shows the profit after spend and the spend per sale. It appears once a sale has used a code, or once you have typed a spend.

Limits. The discount is already in the sale price, so revenue and profit already reflect it; nothing is booked twice. The spend you type is for comparison only: it is not added to your expenses, your profit or your cash. Use your Expenses page for money actually spent. A code only counts the sales saved with it applied, and a campaign with spend but no sales still shows, so you can see money that bought nothing.

### Late payment charge (Settings, Money owed)

Under **Settings, Credit sales** you can set an optional **Late payment charge**: a percentage per month overdue and a grace period in days. Use it only if it is part of the terms you agreed with your customers. An overdue invoice then shows the **late charge so far**, and the WhatsApp reminder mentions it. The charge is simple (not compounding): the amount still owed, times the monthly rate, times the days past the grace period, divided by 30. It is a prompt for you. It is not added to what the customer owes, to your revenue or to your tax figures. If you decide to charge it, bill it like any other sale. Leave it empty (or 0) and nothing changes anywhere.

### Import/Export
**Import-Export** page lets you:
- Export your data to CSV (for Excel, backups)
- Import data from CSV (bulk add products, sales, etc.)
- The Products CSV carries each item's **wholesalePrice** and **taxRatePct** (empty = the shop rate, 0 = tax-free), so an export and re-import keeps them. A tax rate outside 0 to 100, or a wholesale price of 0 or less, is reported on import and not saved.

Useful for migrating data or doing bulk updates.

### Tailor your menu (Settings > Menu, owner only)
Balancr has many pages, and a small business uses a handful. Under **Settings > Menu**, pick the closest starting point (**Shop or product business**, **Service or consulting**, **Products and services**, **Just the basics**, or **Everything**), then tick or untick any page and press **Save menu**. The choice applies to everyone in the business.
- It only hides pages from the side menu and the More sheet. Nothing is deleted, a hidden page still works, a link to it still works, and **Jump to** (Ctrl or Cmd + K) still finds it. Who may open a page is still decided by role.
- Home, Assistant, Notifications, Selling, Buying, Money owed, Reports, Profit, Cash count, Time, Team access and Settings always show, so nobody is locked out of the basics.
- The page you are on stays in the menu while you are on it. If someone asks where a page went, look here first: it may be hidden. Choose **Everything** to bring all pages back.

### Connections and ad spend import (Settings, Account tab)
The app can use outside services. Each one is optional, and a feature stays off until its settings are added. Keys are never typed into the app. They go in your hosting provider's environment settings, the same place as the AI and email keys, so they never appear on a page or in a saved record.
- **Connections card:** Shows each service as **Connected** or **Not connected**, with the setting names still missing. It shows names only, never the key itself.
- **Meta Ads spend:** Add META_ADS_ACCESS_TOKEN and META_AD_ACCOUNT_ID (optionally META_GRAPH_VERSION). Then on Settings, under **Promo campaign spend**, choose **This month so far** or **Last month** and press **Import from Meta Ads**. The app reads each campaign's name and spend, and matches a promo code when the code appears in the campaign name as a whole word (SAVE10 matches "SAVE10 reel", not "SAVE100"). Where a name holds two codes, the longer one wins. Campaigns with spend but no code are listed as unmatched, not counted.
- **Google Ads spend:** Add GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN and GOOGLE_ADS_CUSTOMER_ID (ten digits; optionally GOOGLE_ADS_LOGIN_CUSTOMER_ID and GOOGLE_ADS_API_VERSION). Then **Import from Google Ads** sits beside the Meta button and matches codes the same way. Google reports money in micros; the app converts it to money and adds each campaign's days together.
- **Share and fund prices (Investments):** Add MARKET_DATA_API_KEY. Give an investment its ticker (for example IBM) in the **Ticker or code** box. Then **Refresh prices** on Investments fetches the latest price and trading day for up to five of them at a time, stalest first. The provider's free plan allows only a few requests a minute, so a refresh that hits its limit says so and stops. Prices with no ticker, or that the provider does not list (many local exchange codes are not listed), stay as you typed them.
- **Check the currency:** Meta reports spend in the ad account's currency. If that is not your shop currency, convert the amounts before you press Save.
- **Nothing saves on its own:** an import only fills the box. You review the amounts and press **Save** on Settings.
- **Live exchange rates:** on by default, no key needed (see Money owed).
- **AI assistant and email:** DEEPSEEK_API_KEY turns on the assistant and suggestions. RESEND_API_KEY and TRIAL_NOTIFICATION_FROM_EMAIL turn on email. Each send is still started by you.
### Kitchen printer and bills (Settings, Account tab)
Tickets and bills can print on a thermal printer on your network, without a dialog.
- **Setup:** on the computer that will print, run the print agent with a secret token of at least 16 characters and your app's address: PRINT_AGENT_TOKEN and PRINT_AGENT_ORIGIN (for example https://your-app.example), optionally PRINT_AGENT_PORT (default 9101). Start it with the command in scripts/print-agent.ts. It listens only on that computer.
- **Settings:** on Settings > Kitchen printer, type the agent address (http://127.0.0.1:9101), the token, and the printer's address on your network (for example 192.168.1.50) and port (usually 9100). Press **Save printer**, then **Test print** to check the paper comes out. These settings are kept in this browser only, so set them on each device that prints.
- **Use:** the Kitchen page and each ticket on a tab print to the printer when it is set. **Print bill** on a tab prints the bill the same way.
- **If the printer is not reached:** the ticket or bill opens in the normal print window instead, and the page says why it did not reach the printer. Nothing is lost.
- **Limits:** the agent only sends to private network printer addresses, so it cannot be used to reach other machines. Printing from the browser needs the browser to allow the agent's local address. Thermal printers print plain ASCII: accents are folded (Café becomes Cafe) and other characters show as ?. Check your printer's paper width (32 or 42/48 characters) if the lines look wrong.

- **Limits:** a connection never sends, posts or saves anything by itself. Every import, price refresh and send starts with a button press. Prices come only from the tickers you list, five at a time. Printing to kitchen hardware is not connected: kitchen tickets print through the browser to any printer.

### Consignment (Buy & sell, owner and manager record, accountant reads)
Use this when you leave goods with a partner (a shop, a stall or an agent) who sells them and pays you a share.
- **Goods left with partner:** the partner's name, the product, and how many units. The goods stay yours until they sell.
- **Partner sales report:** when the partner reports what they sold: units, the price per unit they sold at, and their agreed share (%). The app records what you owe them: units times price times their share.
- **Goods came back:** units returned to you unsold.
- **Paid the partner:** an amount you paid them. It cannot be more than you currently owe them.
- **The table:** for each partner, what is with them, what they reported selling, what you owe, what you have paid, the balance still owed, and your share of their sales.
- **Limits:** the app does not check a partner's report against the goods, and it does not count consigned goods in your stock or profit. A payment here is a record only; it is not posted to expenses or sales, so record the money in your usual way too. Entries are never added on their own: each one is saved when you press Save entry. Only the owner can delete an entry, and deleting changes the balances.

### Jobs (work orders) (Buy & sell, owner, manager and staff)
Use this for repairs, trade and made-to-order work: a phone, a car, a sofa, a custom order.
- **Open a job:** the customer (optional), a contact, the item or job, what is wrong or wanted, the date opened, and an optional due date. Numbers run WO-0001, WO-0002 and so on.
- **Labour and parts:** add labour from your services and parts from your products. Each line uses the item's default sell price, and you can change the quantity. Labour and parts are totalled separately.
- **Status:** Opened, In progress, Waiting for parts, Ready to collect, Collected or Cancelled. Each button moves the job one step, and collected and cancelled jobs cannot be reopened (open a new job instead).
- **Print job card:** a printable card with the customer, the item, the problem, the lines, the total and signature lines.
- **Make estimate:** turns the labour and parts into a draft estimate under Estimates. From there it follows the usual path to a sale, so stock, tax and profit work as they always do.
- **Overdue:** a job past its due date that is not collected or cancelled is marked overdue and shown first.
- **Limits:** labour and parts on a job do not change stock until the estimate is accepted and turned into a sale, and a job's lines cannot be changed once its estimate exists (change the estimate instead). Job numbers are assigned when a job is saved, so two people saving at exactly the same moment could get the same number; check the number if that happens. Only the owner or manager can delete a job, and deleting a job does not delete its estimate.

### Quotes: revisions, deposits and the customer link (Estimates page, Owner and Manager)

- **Revise.** A revised quote is a new version of the same quote. The old version is marked revised and its customer link stops working. A quote already turned into an invoice cannot be revised; correct the invoice with a return or a credit instead, so the books stay right.
- **Deposit already held.** If the customer already holds a deposit with you, the revision form shows it against the new total, tax included. A surplus stays on their account as a credit for their next invoice. Balancr never refunds it automatically: refund in cash from Customer deposits only when the customer asks. A shortfall shows as still due.
- **Customer link.** "Customer link" creates a link that is valid for 60 days and copies it to the clipboard. The customer can see the quote, then accept or decline it. Accepting records the name they typed and the time. It is not an electronic signature. It does not convert the quote, move stock or create an invoice, and nothing is charged online; you still convert an accepted quote yourself.
- **What the link cannot do.** It only works while the quote is sent and inside its valid-until date. Balancr does not email or message the customer: you paste the link into WhatsApp or email. An alert appears on the Notifications page when they answer, and the answer shows on the Estimates page. No email or text is sent to you. Expiry is checked against the server clock in UTC, so a quote can expire up to a day early or late by local time.
- **Quotes to chase.** Lists sent quotes that expire within 7 days or are already past their date, with a one-tap message. Quotes with no valid-until date are not listed, because there is no date to chase against.

### Website enquiry form (Leads page, Owner and Manager)

- **The form.** The Leads page has a link you can put on a website, Instagram bio or WhatsApp profile. Each submission becomes a New lead with the source "Website enquiry", so Marketing by channel can show what the website brings in.
- **What happens next.** Nothing is replied automatically. An alert appears on the Notifications page, and the owner is not emailed. Check the Leads page. Website leads are visible to the owner and manager only, because a website lead has no staff member who created it.
- **Limits.** Each internet address can send 10 enquiries an hour, and a business can receive 200 a day. The form has a hidden field that catches simple robots. A business that is locked, or not yet set up, shows "not taking enquiries" and reveals nothing else.

The form also asks **How did you hear about us?** (optional, from a short list: Google search, Instagram, Facebook, TikTok, WhatsApp, Friend or family, Walked past, Other). If the visitor came through a link with utm_source or utm_campaign tags, those and the website they came from are kept on the lead as its campaign and referrer. Nothing is stored beyond these, and a blank answer is not stored at all.

If someone who is already on file enquires again, the new message is added to their lead with the date, and the owner is told it was a repeat. The owner can also switch on the automations under the Lead API on the Integrations page (assign new leads, date them for follow-up today, start the follow-up sequence). Nothing is sent to the visitor by any of them.

### AI assistant key: whose key pays (Integrations page, owner only)

- **Your own key.** Each business runs the AI Assistant on its own DeepSeek key, entered under Integrations, AI assistant (DeepSeek), and switched on. DeepSeek bills that account, not Balancr.
- **Without a key.** The assistant stays off for that business and says why. The public demo and the businesses the operator runs use the operator's key; every other business needs its own. The daily message cap still applies to all of them.
- **Limits.** The key is stored on the server, readable by the owner only, shown masked afterwards, and not included in backups. Removing it or switching it off stops the assistant for that business at once.

### Risks and quality (Operations page: Risks and Quality tabs)

**Risks.** The register holds what could stop the business or cost it heavily. Each risk has a kind (financial, operational, supply, people, IT and cyber, legal, reputation, or business continuity), a likelihood and an impact from 1 to 5, a score (likelihood times impact, from 1 to 25; 15 and above is high), what is done about it, who keeps an eye on it, a review date and a status. An open risk past its review date is flagged. Keep a **continuity** entry for what happens if the usual way fails: a supplier, the main person, the system, the premises. Only the Owner and Manager see the register. The accountant and the floor do not.

**Quality.** Log a check whenever you inspect a product, a service, a production batch, a delivery or a customer complaint. Record the result: pass, pass with a note, or fail. A failed check needs a note of what was wrong. Anyone who works in the business can log a check and read the log. A check can carry a corrective action, with who does it and when it is due; it stays open until the Owner or Manager marks it done on a date no earlier than the check. The tab shows the pass rate over the last 30 days (a pass with a note counts as a pass) and how many corrective actions are still open, however old.

Limits, stated plainly: the register and the quality log hold notes only. They post nothing to the books and move no stock, and no one is contacted from them.

### The business framework: where each area lives in Balancr

This is a plain map of the 29 areas of running a business against Balancr. "Covered" means the area has working records and rules. "Partly" and "Not yet" say exactly what is missing, so nothing is claimed that is not there.

**Value creation.** 1 Strategy and planning: covered. The Playbook holds the owner's plans and contract dates, budgets and cash forecasts hold the numbers, and objectives with a target date, a progress figure and a status are kept on the Objectives tab. 3 Market and competitor research: covered. Supplier price watch, the market price refresh and the prospect finder cover prices and prospects, and the Competitors tab logs what competitors offer, at what price, and how much of a threat they are. 5 Marketing and branding: covered for campaigns, email, promotions, reviews (including reviews from Google, Facebook or a review site, through the review API) and content planning; search-engine tooling is not built. 6 Sales and revenue: covered (leads with score, pipeline, quotes, pricing, discounts, sales channels, lead intake). 7 Customer relationships: covered (customers, feedback, loyalty, renewals, lapsed-customer outreach, the customer account page). 8 Products and services: covered (products, variants, lifecycle, warranty). 9 Operations and processes: covered (routines, tasks, projects, procedures with acknowledgement, rota). 10 Production and manufacturing: covered (production runs, work orders, batches). 11 Procurement and suppliers: covered (purchase orders, supplier scorecard, supplier price watch, the supplier order page where a supplier confirms delivery). 12 Inventory: covered (stock, reorder points, safety stock, economic order quantity, shrinkage, stock counts). 13 Supply chain and logistics: covered (shipments, deliveries, returns); warehouse layout is not modelled beyond locations.

**Business support.** 4 People and HR: covered (employees, payroll, time, rota, leave, onboarding, training in the compliance register, reviews and goals). 15 Financial management: covered (ledger, expenses, bank reconciliation, statements, receivables and payables). 16 Cost and profitability: covered (cost of sales, unit economics, break-even, and the Selling and General and administrative split on the income statement). 17 Budgeting and forecasting: covered (budgets, cash-flow forecast, projections). 18 Funding and capital: covered (loans, capital in and out, investments). 19 Tax: covered (tax records and filings). 20 Assets and facilities: covered (fixed assets with depreciation, equipment and vehicle maintenance, mileage). 21 Technology and IT: partly. Integrations, backups, the lead API and role permissions are covered; cybersecurity beyond the application's own controls is the business's responsibility. 28 Administration and documents: covered. Documents are kept as links (in Drive or similar), the Playbook and procedures hold written know-how, and the Correspondence tab logs letters, emails, calls and messages to and from customers, suppliers and others.

**Control and improvement.** 2 Governance: covered (approvals with limits, roles and permissions, procedures with acknowledgement, the audit log, the closed-period lock). 14 Quality: covered. Checks and corrective actions are on the Quality tab, and the Inspections tab holds the steps for each product, site or vehicle, how often each is done, and when it falls due. 22 Data and information: covered (dashboards, reports, exports, the assistant). 23 Legal and regulatory: covered. Licences, contracts, insurance and permits are tracked with expiry dates, and trademark, domain and copyright, data-protection registration and privacy notice, and environmental permit records are kept in the same register. 24 Risk, security and insurance: covered for the register, continuity plans (as risks), insurance expiry, and fraud controls (cash counts, the audit log, approvals). 25 Health, safety and environment: covered. Incidents, near misses and safety notes are recorded, and environmental permits, waste-carrier and emissions records sit in the compliance register with their expiry dates. 26 Projects and change: covered (projects, milestones, budgets). 27 Partnerships and external relations: covered. Referrals, the supplier and customer links, and statements for investors are covered, and the Partners tab keeps the distributors, resellers, affiliates, agents and investors with each relationship's status. 29 Performance and improvement: covered (KPIs with targets, reviews, corrective actions, stock and cash audits).

**Left out, and why:** sending WhatsApp messages from Balancr through a business messaging provider is left out for compliance: WhatsApp requires approved message templates and each customer's opt-in, and Balancr's design is that the owner sends. Search-engine tooling is left out because it needs an account with a search provider and a decision about sharing site data with it. Everything else in the framework is covered by a record in Balancr.

### Web orders: the queue for orders from your shop or site (Operations page, Web orders tab)

An order placed on your own shop or website can come in automatically, through the same Lead API key as leads and reviews. Your platform or a form tool (through Zapier, Make or n8n) posts it to the business's orders address with the order's number as an external id, the customer's name and contact, the day it was placed, and the lines (what was ordered, the quantity, and the price if the platform sends one).

An order does not become a sale when it arrives. It waits in the **Web orders** tab for the Owner or Manager. Each line is matched to a product by its code (sku or barcode) or by its name, ignoring capitals and spaces. Any line that does not match is matched by hand from a list of your products. Once every line matches, **Confirm and record sales** records one sale per line, on the day the order was placed, with the payment you choose (cash, card, bank transfer, or on credit). Each line is then recorded exactly as any other sale: the stock and the money follow the usual rules. **Decline** records nothing.

If recording stops partway (a line is refused, for example because the period is closed), the message says how many lines were recorded; the lines already recorded are in Sales, and you check them before trying again. A repeated order number is not queued twice.

Limits, stated plainly: a web order records nothing until you confirm it. Confirming records sales through the same path as every other sale, so nothing is recorded that the sales page would not record.

### Online reviews through the review API (Integrations page, the Lead API key)

Reviews from Google Business Profile, Facebook or a review site can come in automatically, with the same Lead API key as leads. In Zapier, Make or n8n, use a POST to the business's reviews address (shown on the Integrations page as the leads address with /reviews at the end), with the key as a Bearer token. Send the reviewer's name, the stars (1 to 5) or a score (0 to 10), the comment, the source (for example "Google") and, if the platform gives one, an external id so a retried request is not filed twice.

Each review is filed as customer feedback, on the Feedback page, with the channel set to online review. Stars map onto Balancr's 0 to 10 feedback scale as 1 star is 2, 2 is 4, 3 is 6, 4 is 8 and 5 is 10; that is the only conversion, and the record keeps the stars it came in as. A review of one or two stars raises an alert for the owner, which you can switch off under Automations. Balancr does not reply to the reviewer; answer on the platform, then mark the review followed up on the Feedback page.

Limits, stated plainly: a review writes a feedback record and nothing else. It posts no sale, changes no customer, and contacts no one.

### Switches: what you can turn on and off

Balancr changes nothing you have not switched on, except the record you enter yourself. These are the switches, and where each one lives.

- **Pause (Integrations page, owner only).** One switch that stops every automatic change to leads and the webhook push until you switch it back on. The alerts and the duplicate merging keep working.
- **Automations (Integrations page, owner only).** Give each new inbound lead to the person with the fewest open leads; make each new lead due for follow-up today; start the new-enquiry sequence on each new lead; merge a repeat enquiry into the lead already on file (on by default); look a lost lead again after a number of days (0 is off); follow a lead up after a number of days when it moves to Proposal sent (0 is off). Each only sets a field on a lead.
- **Text message window (same page).** A time zone and the hours texts may go out. Off until you set a time zone.
- **Low-review alert (same page).** Alerts you when a one or two star review comes in through the review API. On by default; it only alerts.
- **Inspection reminders (same page).** Shows inspections that are due on the Agenda. On by default; it only lists.
- **Webhook address (same page).** Posts each new lead, and each lead's stage change, to an address you choose. Off until you paste one.
- **Lead API (Integrations page).** The key, and a switch on its entry. While the switch is off, the lead and review addresses refuse every request.
- **Customer account and supplier order links (Customers and Suppliers pages).** Made only when you press the button; each lasts 60 days and can be made again.
- **Staff access by role.** Who sees which Operations tab is set by role (see the Operations section). Settings for the company's own pages are under the menu preferences.

Every switch above is off or on by default as stated, and changing it changes nothing that has already happened.

### Lead API, automations and duplicate merging (Integrations page, owner only)

**Lead API.** Zapier, Make, n8n, a form tool or a Meta lead form (through Zapier) can send a new lead into Balancr, and can read the leads that arrived since a time so they can be posted to Slack or a sheet. On the **Integrations** page, the **Lead API** entry has a **Generate a key** button. Press it, then **Save**, and paste the key into the tool as a Bearer token. The page also shows your leads address and ready-to-copy examples. Generating a new key replaces the old one, so update the tool that uses it. Switch the Lead API on with the switch on its entry; while it is off, the address refuses every request. The key is kept with the page's other keys: only the owner can see it, it is masked after saving, and it is left out of backups on purpose, so after a restore generate a new one.

A new lead needs a name, a phone or an email, and can carry a message, a source (for example "Facebook ad"), a campaign, the referring site, what the person said when asked how they heard, whether they agreed to be contacted, and an external id. Give the external id a stable value (the form entry's id, for example): if the tool retries the same request, the lead is not filed twice. Reading returns each lead's id, name, contact, stage, source, owner, next follow-up and creation time; private notes and the contact log are never returned.

**Duplicates are merged.** When someone who is already on file enquires again, through the website or the lead API, the new message is added to their existing lead with the date, and nothing is filed twice. Matching uses the phone number (read the same whether it is written +94 77 123 4567, 0094 77 123 4567 or 077 123 4567, once the country code is set) and the email address. Leads entered by hand are matched too. A local number is only matched when the country code is set under **Automations**; without it, a number that starts with 0 is not matched, so set the code for your country. Leads filed before this change match on the text they were entered with.

**Automations.** Under the Lead API on the Integrations page, each automation has its own switch. Every one of them only sets a field on a lead. None sends a message.

- *Give each new lead to the team member with the fewest open leads.* Among owners, managers and staff (not the accountant, not anyone switched off), the one with the least open work gets it, ties go by name. Turning it off leaves new leads unowned.
- *Make each new lead due for follow-up today.* The lead is due on the day it arrives.
- *Start the five-touch follow-up sequence on each new lead.* The sequence is the one on the Leads page. Each step is a reminder of what to send and when; you send it and log it.
- *Merge a repeat enquiry into the existing lead.* On by default.
- *Look at a lead again after a number of days when it is marked Lost.* Set the number of days; 0 turns it off. A lead already given a revisit date keeps it.
- *Follow a lead up after a number of days when it moves to Proposal sent.* Only if it has no follow-up date already; 0 turns it off.

**Text messages in a window.** Under **Text messages** on the same page you can set a time zone (for example Asia/Colombo) and the hours texts may go out, from and until (default 08:00 to 20:00 local time; a window running past midnight, such as 22 until 6, is fine). The daily reminders for overdue invoices that go by text are held back outside that window, and a held-back reminder is not recorded as sent, so the next daily run that falls inside the window sends it. Email is never held back. With no time zone set, texts are not held back at all.

**Send new leads out.** Paste a web address (it must start with https and be a public address) into **Webhook address** and every new lead from the website form or the lead API is posted to it as JSON, once: a `lead.created` event with the lead's id, name, contact, source, campaign and owner. This is the push side of Zapier or Make: a catch hook receives each lead as it arrives. A failed post does not lose the lead, which stays on the Leads page; nothing is retried. Addresses inside a private network, or that redirect, are refused.

**Lead score.** Each open lead on the Leads page shows a score from 0 to 100. It is built only from facts on the lead, and hovering over the number lists each reason with its points: whether there is a phone and an email, the stage, an estimated value, how many contacts were logged and whether you spoke with them, how recently it was contacted, whether the person agreed to be contacted, an expected close within 30 days, and an overdue follow-up (which takes points off). It is a guide to what to work next, not a forecast, and it uses no outside data.

Every automation is off unless you switch it on, except merging duplicates and the alert for low reviews, which only alert. Turning one off changes nothing already done: the owners, dates and sequences it set stay as they are.

Limits, stated plainly: the lead API and the automations write leads and nothing else. No message is sent, no money moves, and no record outside Leads changes. A request with a wrong key, a switched-off lead API or an unknown business gets a plain refusal that says nothing about the account. Requests are limited per address and per business each hour. Balancr does not look up contact details for a lead from outside sources; anything you want enriched you must do in the tool you use.

### Tax identity and locked sales (Settings, owner only)

- **Tax identity on documents.** Settings has a TIN and a VAT registration number. They print under the business name on quotes, invoices and statements, and only when a business name is set.
- **What is not checked.** Balancr does not check the TIN or VAT number against the IRD, and it does not confirm that a printed document matches the invoice format the IRD requires. Check the layout with your accountant before you give a printed invoice to a VAT-registered customer.
- **Locking issued sales.** Turn on "Lock issued sales" once you are VAT-registered. The lock covers every sale, old and new, and applies in the app and in the security rules. Only a sale's project and note can still change. Deleting a sale is blocked.
- **Correcting a locked sale.** Record a return or a credit instead. Returns are not locked, so the original sale and the correction both stay on record. Turning the lock off reopens every sale.
- **What is not built.** Balancr does not yet produce the IRD's VAT schedule file (schedules 01, 04 and 07). Submit schedules through the IRD e-Service portal, or in a CSV the IRD accepts, prepared with your accountant.

### Customer invoice link and payment claims (Invoices page, owner and manager)

- **The link.** On each invoice, "Customer link" copies a link valid for 60 days. The customer sees that one invoice: its lines, discounts and returns, tax, payments already recorded, and the balance due. The balance is worked out the same way as on the Invoices page.
- **How to pay.** Type how to pay under Settings, "How customers pay", for example your bank and account details. Balancr does not connect to a bank, take card payments, or hold money. The customer pays you directly.
- **"I've paid" is a claim, not a payment.** The customer's message appears on the Notifications page as "Customer says they paid". Balancr records nothing. Check your bank, then record the payment on the Receivables page. The balance the customer sees changes only when you do.
- **What the balance leaves out.** A customer deposit or credit you hold for them, a write-off, and anything not yet entered in Balancr are not counted. A cash sale was paid when made, so nothing can be claimed against it.
- **Limits of the link.** It works for 60 days and only for that one invoice. Anyone holding the link can view it and send a claim, limited to 20 claims an hour per address. Only the owner or a manager can create a link.
- **What the link never shows.** Cost prices, stock, and other customers' records.

### Weekly brief (Dashboard, owner and manager)

- **What it does.** "Write brief" writes a few plain sentences about the last seven days. The figures it uses are listed under the text, so you can check each one.
- **How it is kept honest.** The model is given the figures and is not asked to calculate. A brief that quotes any figure not listed, or any percentage, is refused. Nothing is saved, emailed or posted.
- **What the figures cover.** Sales are the value of sale lines this week, before returns, discounts and tax. Payments are customer payments recorded this week. Overdue balances use the same arithmetic as the customer invoice link. Expenses are one-off expenses dated this week only: recurring costs are not included.
- **Cost and limits.** It uses the business's own AI key and counts toward the daily AI limit. It summarises; it does not predict or advise.

### Making a quote from a lead (Leads and Estimates pages)

- **The hand-off.** "Make a quote" on a lead opens a new quote with that lead's name, contact and notes. Nothing is created until you save the quote.
- **What does not change.** The lead is not changed, and the quote is not linked back to the lead automatically.

### Table time by the hour (Bookings, owner and manager)

- **Set it up.** Make the bookable service a service product whose unit is "hour", and enter the hourly rate as its price.
- **What it does.** When you record a Done booking as a sale, the price is suggested as the hourly rate times the booking's length, with the working shown. You can change it.
- **What it does not do.** The sale is still one unit at the price charged, so the books record money, not hours. Packages are not calculated: type the figure. Membership hours are counted on the Memberships page. Services not priced by the hour get no suggestion.
- **Minimum charge, blocks and per-person rates (owner).** The Table-time pricing card on the Bookings page has three optional settings: a minimum charge in minutes (a 30 minute visit billed as 60), billing in blocks (70 minutes billed as 90 with 30 minute blocks), and "Rate is per person", which multiplies the hourly rate by the number of people on the booking. Enter the number of people in the booking's People box. The suggestion shows its working, for example "1.5 h at 600 per hour for 4 people (booked 70 min, charged as 90)".
- **Limits of table-time pricing.** One set of rules applies to every service priced per hour; there are no different rates for different group sizes, times of day or days of the week. It only suggests a price: you can type any figure, and what is posted is the figure you confirm. The number of people never limits or blocks a booking, and it is not collected on the online booking page.

### Cheques (Money, owner and manager; accountant can view)

- **What it is.** A register of cheques you received and cheques you wrote, including post-dated ones. A post-dated cheque is a promise, not cash, so the register changes none of your books: it never records a payment. When a cheque clears, record the payment on Money owed or Bills as usual.
- **Add one.** "Cheque received" or "Cheque issued": who, the cheque number, the amount, the date written on it, the date you received or wrote it, and optionally the bank.
- **Where it stands.** Each cheque shows one of: Post-dated (its date is still ahead, so it cannot be banked yet), Ready to bank, Bank soon (within two weeks of six months old), Stale (more than six months after its date, so the bank will not pay it), With the bank, Returned, or closed (Cleared or Cancelled).
- **Moving a cheque on.** Held cheques are marked banked; banked cheques are marked cleared or returned. A returned cheque needs the reason the bank gave, and can record the bank's charge, which is for your records only: record it as an expense if you paid it. A returned cheque can be banked again while it is still valid. A post-dated cheque cannot be marked banked before its date, and a stale cheque cannot be banked at all.
- **The top of the page.** Ready to bank, post-dated cheques held, returned cheques to chase, and cheques you wrote that have not cleared. A four-week outlook adds up what the cheques alone say is coming in and going out each week.
- **On the Agenda.** Cheques ready to bank, about to go stale, returned and needing a chase, and issued cheques falling due appear on the Agenda page.
- **Limits.** The six-month rule is the usual bank rule, counted in calendar months from the date on the cheque; your bank's own rule decides. The outlook uses the date on the cheque and assumes a received cheque is banked on the first day it can be. Nothing is checked with a bank, a cheque is never linked to an invoice automatically, and a cleared cheque cannot be deleted because it is the record of a payment: cancel a mistaken cheque before it clears. Staff cannot see this page.

### Memberships (Buy & sell, owner and manager; accountant can view)

- **What it is.** A prepaid bank of included hours for a regular customer, for example "Monthly 10 hours" valid from one date to another. Record what the member paid as an ordinary sale on the Sales page: that is when the money reaches your books. The Memberships page only counts the hours.
- **Using it.** On a booking, "Covered by membership" lists that customer's memberships that are in date and have hours left. A covered booking uses its length from the membership and has no sale to record, because the money was recorded when the membership was sold: it is left out of the "to record as a sale" list and raises no reminder. The page shows hours included, used (Done bookings), booked (still to happen) and left, and what lapsed after the last day.
- **Rules.** A booking is matched to a membership by the customer's name as typed, ignoring capitals and extra spaces. A booking outside the membership's dates, for someone else, or longer than the hours left is refused. A cancelled or no-show booking uses no hours. A membership cannot be cut below the hours already used, or its dates moved past a covered booking, and cannot be deleted once bookings under it are Done.
- **Limits.** Unused hours lapse on the last day: nothing rolls over, and nothing is refunded or posted for lapsed hours. One booking is covered by one membership, so a long booking cannot be split across two. No fee is taken, no sale is made and no expiry reminder is sent by the app. Staff cannot choose a membership on a booking, though a booking they edit keeps its link. Matching by name means a customer spelled two ways needs a membership under each.

**Ending soon.** Above the list, **Ending within 14 days** shows each active membership that ends in the next two weeks and still has hours left, with the hours left and the end date. Hours not used by the end date are lost, so these are the customers to speak to about renewing. The list only reads; renewing is a new membership.

### Farm batches (Buy & sell, owner, manager and staff)

- **What it is.** A group of animals or a crop followed from stocking to harvest: a fish cage, a pond, a poultry house, a plot. Start a batch with the species, the date, how many, and their average weight in grams. Then add entries as things happen: deaths, animals culled or removed, animals added, feed given (kg), a weight sample, a water reading, a cost, and harvests (how many and how many kg).
- **What it works out.** Alive now, survival, average weight (from the latest sample), biomass (alive times average weight), feed conversion (feed given per kg grown, the standard measure of how efficiently feed became weight), harvested kg, and cost per kg harvested. A batch with unusual losses in the last week shows a warning.
- **Water readings.** You can set safe ranges for temperature, oxygen, pH and ammonia on the batch. A reading outside a range is flagged. Nothing is blocked.
- **The books.** Buy feed and stock through Purchases and sell the harvest through Sales as usual. A batch posts nothing. The costs you type on a batch exist only to work out cost per kg, so nothing is counted twice.
- **Limits.** Feed conversion needs growth to measure against: it shows "n/a" until there is a weight sample above the stocking weight. Biomass is an estimate from the average weight of your samples, and lost animals are not counted in the growth, which makes the ratio slightly better than the truth. Water ranges are the ones you set: Balancr does not know what is safe for your species. There is no sensor, camera or automatic feed integration, no breeding or genetics records, and no treatment or withdrawal-period tracking. A batch holds up to 3000 entries; close it and start another after that. Anyone on the team can add an entry and only the owner and manager can remove one.

### Mileage (Money, owner and manager; accountant can view)

- **What it is.** A log of business trips by vehicle: the date, the vehicle (any label you use), the business purpose, optionally where from and to, and the distance. If you keep odometer readings, enter the start and end and the distance is worked out for you.
- **Cost.** Optionally enter what a kilometre costs you. The page then shows an estimated running cost for the month, in total and by vehicle. It is an estimate for your records: it is not posted as an expense, so it cannot double-count fuel or repairs you already recorded.
- **Checks.** If a trip's start reading is lower than where the previous trip in the same vehicle ended, the page lists it under "Odometer readings to check". A distance you type next to readings must agree with them within half a kilometre.
- **Limits.** A memo only: it changes no expense, profit or tax figure. It does not track location, work out routes or distances, or produce any form for a tax authority. Gaps in the readings are not flagged, because a vehicle may also be used privately. A trip you delete is gone for good. Staff cannot see this page.

### Promised stock (Estimates, owner, manager and accountant)

- **What it shows.** Accepting a quote moves no stock, so two accepted quotes can promise the same units. At the top of the Estimates page, "Promised on accepted quotes" lists each item promised on quotes that are accepted and not yet turned into an invoice, with what is on hand, what is short, and whether orders already placed with suppliers cover the gap.
- **Limits.** Goods only: services are never counted. It changes no stock, no quote and no figure. Quotes that are sent, declined, expired or already invoiced are left out. It does not reserve stock: a sale made to someone else can still use the units. Staff do not see it, because they do not see stock.

### Game nights and tournaments (Events, owner, manager and staff)

- **Set up an event.** Give it a name, date, start time, number of seats and ticket price, and choose the service the tickets are sold under. Other costs for the night (prizes, venue hire, extra staff) are optional.
- **Sell seats.** "Sell seats" records one sale per booking, for the seats bought, linked to the event. It stops at the seats left, and a cancelled event sells nothing.
- **The night's result.** Shows ticket sales less other costs. Food and drink sold on the night are not counted in it: record those on the Sales page as usual.
- **What is not built.** Other costs are typed for the night's result and are not posted as expenses. Events have no online payment, no waiting list and no check-in. An event with ticket sales cannot be deleted: cancel it instead, and its sales stay in the books. Returned or discounted tickets still show at their original value in the summary until corrected on the Sales page.

- **Online seat requests (owner and manager).** Tick "Take seat requests online" on an event and it appears on your public ticket page (the link is on the Events page), with its date, time, price per seat and seats left. A customer picks an event, the number of seats (up to 10) and leaves a name and a phone number or email. The request arrives as a high-priority notification. It is a request, not a sale: no seat is held and no money is taken. Confirm with the customer, then sell the seats under "Sell seats" as usual.
- **Seat request limits.** Two customers can request the last seats at once, because requests hold nothing: you decide who gets them. Seats left on the page count only sales recorded against the event. Only scheduled events up to 180 days ahead are shown, and no payment is taken online. Each address can send 10 requests an hour and a business receives 100 a day. The page shows no costs and no one's name.

### Online booking requests (Bookings, any business)

- **The link.** The Bookings page has a link customers can use to request a time: they pick a service, a day within the next 90 days, a start time, a length, and leave a name and a phone number or email.
- **A request is not a booking.** It is saved as "booked" on the Bookings page and raises an alert on the Notifications page. You confirm it, change it, or cancel it. Nothing is confirmed automatically, and nothing is charged.
- **What customers see.** For the day they pick, the page shows which times are already taken, with no names. Services shown are the active services in your catalogue.
- **Limits.** Two requests for the same time can both get through if they arrive at the same moment, so check the Bookings page before you confirm. Times earlier today are not refused, because the request is checked against bookings, not the clock. Deposits and online payment are not taken. Each address can send 10 requests an hour, and a business can receive 100 a day.

### Card payments through PayHere (Integrations, and the customer invoice link)

- **Strategic choice.** PayHere is used because it is a Sri Lankan card gateway that takes LKR. Each business uses its own PayHere merchant ID and secret, entered under Integrations, PayHere (card payments), and switched on only after testing in sandbox. The money goes into your PayHere account. Balancr never holds it.
- **What the customer sees.** On the invoice link, "Pay by card" appears only when this is set up. The amount is the amount they choose, up to the balance. The card is entered on PayHere's page, not in Balancr.
- **What gets recorded.** A payment is recorded on Receivables only when PayHere confirms it with a signed notice for the exact amount and currency issued. It is recorded as card, against the first line of the invoice. Repeated notices record it once. No separate alert is raised, because the payment itself is the record.
- **Limits.** Balancr has not been tested against a live PayHere account; test in sandbox first. PayHere may ask for address details the app does not collect, so the app sends "Not provided" and the customer may need to type them. Refunds are made in PayHere and then recorded as a return here. PayHere's fees are charged by PayHere. If the confirmation never arrives, the invoice stays open: check PayHere, then record the payment by hand on Receivables. The site address must be public and secure (https) for PayHere to confirm payments.

### Overdue reminders by email, and by text message (Settings, owner)

- **Off by default.** Turn on "Send overdue reminders by email" in Settings. Set the days between reminders (1 to 60, default 7), and optionally a reply-to address.
- **What is sent.** One email per overdue invoice per interval, to the email address in the sale's contact field, with the invoice link, the balance and the due date. No email is sent to a contact that has no email address.
- **Text messages (optional).** Under the reminder settings, "Also send a text message (SMS)" adds a second route for customers who have a Sri Lankan mobile number on the sale (07X, +94 7X or 94 7X) but no email address, or whose email could not be sent. A customer never gets an email and a text for the same invoice in the same interval. A text names your business, the invoice, the amount and the date it has been unpaid since, and adds the invoice link and your payment instructions only if they fit in one message (320 characters). It is sent through Notify.lk, a Sri Lankan SMS service, and each text is paid for from your Notify.lk account.
- **Limits.** Texts need the Notify.lk user id, API key and an approved sender name set on the server, and the option switched on in Settings; without them no text is sent. Landline numbers and numbers from other countries get no text. No WhatsApp messages or phone calls are sent by the app. The email comes from Balancr's sender address, and replies go to the reply-to address if one is set. It is a payment reminder for a specific invoice, not marketing, and it carries no unsubscribe link. A text cannot be replied to by the customer through Balancr. At most 200 emails and 100 texts go out per daily run. It needs the email service configured and the daily job scheduled on the server.

### Quote acceptance is a record, not an e-signature (Quotes)

- **Decision.** Balancr does not use an e-signature provider. A customer's acceptance records the name they typed and the time. That is enough for ordinary quotes between businesses and customers, and it adds no external service or cost. Where the law requires a signed contract, sign it separately.

### Outreach (Buy & sell, owner, manager and staff)
Who to contact this week, and what to say. The templates never send a message by themselves: you press send in your own app. The one exception is the Email campaign below, which you send on purpose.
- **Segments:** Lapsed (not bought for 60 days or more), Birthdays coming up (today through 14 days ahead), Top customers by spend (top 10), and New (first order within the last 30 days). Each row says why the customer is there.
- **Messages:** pick a template (We miss you, Birthday wish, Thank you, Welcome) and optionally add offer wording. Names and your business name are filled in; unknown placeholders are removed.
- **Send:** WhatsApp or Email opens your own app with the message ready. You press send there, then press **Messaged** here. Copy also works for any other app.
- **Consent:** offers (the lapsed, birthday and welcome templates) go only to customers marked Agreed to receive offers. Set that on each row when a customer agrees. Order messages go to anyone with a phone or email saved.
- **Birthdays:** enter them on each row as MM-DD (or a full date). Only the day and month are used.
- **Repeats:** a customer messaged in the last 7 days is flagged, so you don't message them twice.
- **Ask for a review:** the Bought recently segment lists customers who bought in the last 14 days. Set your review link once (Review link and post caption, on this page). Every recent customer is listed, not only happy ones, because asking only people who seem pleased breaks the rules of the review sites. A customer asked in the last 60 days is not listed again.
- **Referrers:** type the name of the customer who sent someone to you in **Referred by** on that customer's row. The Referrers segment lists the people who sent customers your way, most first, so you can thank them. Rewards are not tracked by the app: give them through Offers or Gift cards.
- **Post caption:** a caption built from your offer wording, your business name and your review link. Copy it and post it in your own social app. Nothing is posted by the app.
- **Not built, on purpose:** timed follow-ups that send by themselves. Every template message is sent by you pressing send in your own app.
- **Email campaign (owner and manager).** The card at the top sends one email, with a subject and message you write, to every customer who is marked as agreed to offers and has an email address on their record. Each customer is greeted by first name and gets their own one-click unsubscribe link, added for you. Pressing it switches that customer's "agreed to offers" off straight away, and templates that carry offers then skip them. Customers who have not agreed, who said no, or who have no email address are never emailed. Up to 100 emails go out in one send and 200 per day: if more are waiting, send again later. It needs the email service configured on the server. It changes no sale, payment, stock or balance.
- **Email campaign limits.** Email only: no SMS or WhatsApp campaigns. There is no scheduling, no choosing a segment (it goes to everyone who agreed), no open or click tracking and no pictures. The unsubscribe link works for a year after the email is sent. A customer who gives their email in a different spelling on two records is emailed once.
- **Work through the list:** the button under the templates goes through the messages one customer at a time. Each step shows the message and an Open WhatsApp or Open email button. You press send in your own app, then **Messaged, next** (or Skip, or Stop). The app never opens a message on its own.
- **Limits:** the segment thresholds (60 days, 14 days, top 10, 30 days) are fixed for now and are not set in Settings. Customers are matched to sales by name, the same way the rest of the app does, so a spelling difference splits one customer into two. Messages are limited to 600 characters. The app does not track replies or opens, and it does not check your consent records against any outside list.

### Licences and trade-ins (Buy & sell, owner and manager)
Keep the licences and permits you need with their expiry dates, record trade-ins you take as part payment, track price-protection claims when a supplier cuts the price of stock you still hold, and plan product development (R&D) projects from idea to launch.
- **Licence or permit:** the name, who issued it, the number, the issue date, the expiry date and the cost to renew. Licences that have expired or expire within 60 days are listed at the top, soonest first, with a Due soon or Expired badge.
- **Trade-in:** the device handed in, the customer, the serial number, its condition (excellent, good, fair or faulty), the credit agreed and the date. Each trade-in is Open until you mark it Credited, Paid out or Resold.
- **Price protection:** the product, the supplier, the old and new price per unit, the units you still hold and the date the supplier cut the price. The claim is the drop per unit times the units you hold, shown before you save. Mark it Claimed or Credited when it is settled.
- **R&D project:** a product or project name, its stage (Idea, Prototype, Testing, Certification, Launched or Dropped), a budget and a target launch date. Move it along with its stage buttons. The page totals the budgets of projects not yet launched or dropped.
- **Totals:** the trade-in credit still owed, the price-protection claims still open, the R&D budget still open, and the number of licences to renew.
- **Limits:** a project budget is a plan only; spending it is recorded as purchases and expenses in the usual way. The app does not file with any authority, renew a licence for you, claim from a supplier or pay anyone. It does not post trade-in credit or a claim to the ledger, and a trade-in credit is not applied to a sale automatically: apply it on the sale in the usual way. Reminders appear on this page only; nothing is sent by email or message. Only the owner or manager can add or change these records, and deleting one does not change any sale, purchase or stock.

### Price and condition (Buy & sell, owner and manager)
Set a minimum advertised price (MAP) for each product, record its condition, and see sales charged below MAP and the stock value by condition.
- **Minimum advertised price (MAP):** set per product on this page. Leave it blank for no minimum.
- **Sales below MAP:** every sale in the period charged below its product's MAP, with the gap per unit and in total, largest first. Free items (a price of zero) and delivery charges are not counted. Discounts and promo codes are counted, because they lower the price charged.
- **Condition:** new, open box, refurbished or used. A product with no condition counts as New, so set the condition on used and refurbished stock.
- **Stock by condition:** units on hand and their value at cost, for each condition.
- **Limits:** the app never blocks or changes a sale below MAP, and never contacts a brand, a buyer or a retailer. The sales list is worked out from your recorded sales each time you open the page. Condition does not change stock, cost or profit; a refurbished unit is still the same product in your books. Each product row is saved with its own Save button.

### Settings
Configure your business:
- **Promo codes (optional):** Type codes with their percent off, such as SAVE10:10, WELCOME:5. On a single sale in your shop currency, the sale form then has a **Promo code** box: type a code and press **Apply** to fill in the lower price. The sale is saved at that price, so revenue and profit already reflect it. Limits: a code only fills in the price; you can still change the price after applying it. It only works in your shop currency, not a foreign-currency sale. Codes are not checked for dates or how many times they are used.
- **Promo campaign spend:** Type what each code cost, such as SAVE10:5000. Or, with Meta Ads connected, press **Import from Meta Ads** (see Connections and ad spend import). Nothing from this box is added to your expenses or profit.
- **Extra customer details (optional):** Up to four names for extra boxes on each customer (see Customers).
- **Tax rate:** Your corporate tax %
- **Currency:** LKR, USD, EUR, etc.
- **Forecast horizon:** How many months to project forward
- **EOQ defaults (Operations tab):** Ordering cost, holding cost %, lead time, and an optional **safety buffer (days)** (for reorder planning)
- **Owner pay:** What you'd pay someone else to do your job (shows "true profit")
- **Close the books (Operations tab, owner only):** Once a month is reviewed or its statements are printed, close it. Nobody can then add, edit or delete a sale, purchase, one-off expense, payment, return, discount, stock adjustment, capital entry or tax payment dated in a closed month — including you. You can reopen any time; each change is recorded in Activity. Recurring items (rent, salaries, loans) aren't frozen; to change one without touching closed months, end the old one and start a new one.

**AI entries:** the Assistant turns "sold 3 bags of cement to Kamal for 4500" into a pre-filled form. Nothing is saved until you check it and press Save (or **Confirm all**). The Quick Entry box has a "Save without reviewing" option, off by default.

---

## Moving over a business that is already running

Pick a start date (the first of a month is easiest) and enter what you have on that day. Do this once.

1. **Cash and stock as owner's capital.** In Profitability, add a capital investment dated the start date. The amount is your cash on hand plus the cost value of your stock.
2. **Stock.** For each product, add one Purchase dated the start date, paid in cash, with the quantity you hold and what it cost you per unit. Your cash then comes out at what you actually have, and stock shows at its real cost.
3. **Money customers already owe you.** On **Money owed**, press **Add opening balance**, choose "A customer already owes me", and enter one row per unpaid customer invoice: the customer, the amount still owed, the start date, and the due date. Add their phone number if you want to send reminders.
4. **Money you already owe suppliers.** Same button, choose "I already owe a supplier", one row per unpaid supplier bill.
5. **From then on,** log everything as normal. When a customer pays an opening balance, or you pay a supplier, record the payment on the Money owed page like any other. Don't enter the old invoice again as a sale.

Check: the Balance Sheet should balance, cash should match your real cash, stock value should match your count, and Money owed should match your list of unpaid invoices and bills.

What an opening balance does and doesn't do:
- It adds **no sales and no costs**, so your past months and profit stay exactly as they were. It shows as money owed to you (or by you) on the Balance Sheet, with the matching amount included in owner's capital, the same way cash and stock brought in on day one are.
- When the money is collected or paid, cash moves and the balance shrinks. Profit doesn't change, because the sale was made before you started.
- If a customer never pays, write it off as bad debt like any other invoice. That is a real loss and appears in that month's profit.
- There is no edit button, because the amount feeds owner's capital. If you get one wrong, delete it (owner only) and add it again. Deleting also removes any payments or write-offs recorded against it.
- The start date can't be in a month you have already closed.
- Money owed on ordinary bills (rent, utilities) that you haven't entered yet: enter the bill on Expenses as "owed — not paid yet".

## Common Questions

**Q: What's the difference between Purchases and Orders?**
- A: Purchases = stock you already have in hand. Orders = stock you've ordered but haven't received yet. Orders are optional — you can skip them and just use Purchases.

**Q: How do I handle services?**
- A: Add them as Type: Service in Products. When you deliver the service, log the cost in Purchases (what it cost you in time/materials). Then log the sale in Sales. The profit calculation works the same.

**Q: What's WAC?**
- A: Weighted Average Cost. If you buy 10 units at 100, then 10 units at 120, your average cost is 110. Every sale uses this average cost. It's simple and accurate for most small businesses.

**Q: Can I cost each sale at the batch it came from instead of the average?**
- A: Yes: Settings → General → "How cost of goods is worked out" → "Each batch's own cost". Each sale is then costed at the batch you picked on the sale form, otherwise the batch that expires soonest, otherwise the oldest delivery. It suits goods that expire or whose buying price moves a lot. It changes every past month's profit and your stock value (not just new sales), so choose once; it can't be switched while your books are closed, and the change is recorded in the audit log. Leave it on Average cost if you are unsure: it is simpler and accurate for most small businesses.

**Q: Why are there two profit numbers?**
- A: "Net profit" is your actual profit. "True profit" subtracts what you'd pay someone else to do your job — shows if the business is profitable beyond just your unpaid labor.

**Q: Can I use this for multiple businesses?**
- A: Each account is for one business. Create separate accounts for separate businesses.

**Q: Is my data safe?**
- A: Yes. Data is stored in Firebase with security rules that only you can access. It's backed up in the cloud.

**Q: What do the "strategic" metrics on the Financial Health page mean?**
- A: (all on the **Financial Health** page, not Dashboard)
  - **Growth rates**: Shows how much revenue/profit changed vs last month or last year (as %)
  - **Average order value**: How much customers spend per sale on average
  - **Revenue per employee**: How much revenue each active employee generates, trailing 12 months
  - **Inventory turnover**: How many times you sell through your entire stock per year (higher = faster sales)
  - **GMROI (gross profit per 1 of stock)**: Yearly gross profit divided by the cost of the stock you hold. Above 1 means your stock earns more than it cost; it combines margin and turnover, so it shows whether your stock money is working hard or sitting idle
  - **Days of inventory on hand**: How long current stock will last at current sales rate
  - **Cash runway**: How many months you can operate before running out of cash, at your recent average burn rate
  - **Payroll vs. revenue**: Today's committed payroll as a % of average monthly revenue
  - **Debt service coverage**: Whether cash from operations covers your loan payments, once you have an active loan
  - **Return on assets / working capital**: Two more health checks that sit next to return on equity and the current ratio

**Q: What can't Balancr do for a product business? (known limits)**
- A: These are known and deliberate for this version, each with a simple workaround:
  - **One flat tax rate.** If you sell goods taxed at different rates, the tax figures will be approximate; keep mixed-rate items out of tax reporting, or ask your accountant to adjust.
  - **No bank feeds, card-terminal or barcode-hardware links, and no e-filing.** Reconciliation works from a statement you import; nothing is sent to a tax office.
  - **Packs on estimates and repeating invoices.** You can sell by the carton on the sale form and the multi-item invoice, but estimates and repeating invoices are still entered in single pieces (a dozen at a dozen price: enter 12 at the per-piece price).
  - **Variants are separate items** (they are grouped and summed for you, but each has its own stock and price). There is no single "Polo shirt" with a size picker on the sale form; pick "Polo shirt — M / Red" from the list.
  - **Stock-outs are only costed from what you log.** Balancr can't see a customer who walked away. Use **Products → Lost sales (out of stock)**, or the link on the sale form's "only N left" warning, and the cost shows as a number you recorded yourself. It never estimates demand you didn't log.
  - **No TAM/SAM/SOM or ad-return (ROAS) figures**, because they need market data or ad-platform links this app doesn't have.

**Q: I logged a return, discount, or stock adjustment by mistake — how do I undo it?**
- A: Owner only. Open **Sales** and scroll to "Recent returns & discounts" at the bottom — delete the wrong one there; stock and revenue recalculate automatically. For a bad stock adjustment (wrong reason, typo'd quantity), open **Products** and scroll to "Recent stock adjustments." Both sections are collapsed by default. Blocked once that month is closed — see "Close the books" above. Goods sent back to a supplier are listed under **Purchases → Sent back to suppliers**; delete one there and the stock, the refund or the bill credit reverse.

**Q: A customer is never going to pay me — what do I do?**
- A: On the Receivables & Payables page, use **Write off** next to that customer's outstanding balance (Owner/Manager only). You can write off the full amount or a partial amount (e.g. if they settled for less). It disappears from receivables and aging immediately, and records a same-sized bad debt expense that month, which corrects the profit you'd already booked on that sale. It doesn't touch cash — nothing was ever collected. Only the owner can reverse a write-off, from the write-off history on the same page.

**Q: Does this track ROAS (Return on Ad Spend)?**
- A: No, and deliberately not — a trustworthy ROAS needs to know which specific sale came from which specific ad/campaign (attribution), which means integrating with the ad platforms themselves (Google Ads, Meta, etc). This app doesn't do that, and a "blended" version (total revenue ÷ total marketing spend, with no attribution) is a commonly-misused number that overstates marketing's actual return by crediting it with organic and repeat sales it didn't cause — this app won't show a number like that. What it does show honestly, from data it actually has: **Customer Acquisition Cost** (marketing spend ÷ new customers) and **LTV:CAC ratio** (both on Financial Health / Customers) — the same underlying question ("is what we spend to get a customer worth it") answered with numbers this app can actually stand behind.

---

## Tips for Best Results

1. **Be consistent** - Log sales and purchases regularly (daily or weekly)
2. **Use categories** - Add categories to expenses (Rent, Marketing, etc.) for better tracking
3. **Check reorder flags** - The Products page tells you when to restock
4. **Review monthly** - Look at the Dashboard and Statements each month
5. **Export backups** - Use Import-Export to download CSV backups periodically

---

## Getting Help

If something isn't clear:
1. Check this manual first
2. Look at the existing README.md for technical details
3. Your data is always safe — you can export it anytime

---

## Summary

**What you need to do daily:**
- Log sales (Sales page)
- Log purchases (Purchases page)

**What you need to do weekly:**
- Check stock levels (Products page)
- Review expenses (Expenses page)

**What you need to do monthly:**
- Review profit (Dashboard)
- Check statements (Statements page)
- Adjust forecasts if needed

That's it! The app handles all the calculations automatically.

**Q: What are "Customers to chase" and "Bills to pay" on Home?**
- A: They only appear when there is something to do. "Customers to chase" adds up customer invoices that are past their due date and shows your three biggest. "Bills to pay" adds up supplier purchases and bills that are already late or due within a week. Both use the same figures as the Money owed page — tap through to send a WhatsApp reminder or record a payment.

### Pick lists (Invoices page)

On the Invoices page, each invoice has a **Pick list** button. It opens a printable sheet for whoever packs the order: each item and its quantity with a tick box, with the same product on several lines of the order combined into one line, listed by name so the packer walks the shelves once. The sheet shows no prices, costs or margins. Printing a pick list records nothing and moves no stock.

### Automation: what Balancr does for you, and what waits for you

Balancr fills in the repetitive parts of the work and keeps the decisions with you. Nothing that sends a message, posts a reply, or moves money happens without your press.

Done automatically: expense categories are suggested from the name you type (for example *electricity* goes to Rent and utilities, *fuel* to Transport, *Facebook ad* to Marketing), and a category you have already chosen is never changed. Recurring invoices and expenses are created on their dates. Leads are assigned, dated and given sequences when the automations you switched on say so. Inbound orders, enquiries, reviews and API leads are filed for you. Price changes are recorded. Low reviews, due inspections and due renewals are listed for you.

Drafted for you, sent by you: a reply to an online review. On a review on the Feedback page, press **Draft a reply**. It uses the same AI allowance as the post ideas and message drafts, and the draft is text only. Read it, edit it, then post it on the platform yourself. Lead messages and post ideas work the same way.

Limits, stated plainly: suggestions and drafts change no record and send nothing. A category is only filled when it is empty. The AI allowance is the business's own daily limit; when it is used up, the draft says so and nothing else changes.

### Testimonials on your enquiry page (Feedback page)

A customer's own words are the cheapest sales tool you have. On a feedback entry scored 8 or more, press **Show on your website**. Check the name shown (first name and last initial by default) and the words (they start as the customer's comment; keep only the part you may show, up to 300 characters). Tick the box confirming the customer has agreed to this being shown. Then **Show it**. Approved words appear under *What customers say* on your enquiry page, newest first, up to ten. **Take down** removes them.

Nothing is shown without the tick, and nothing is shown for a score below 8. The public page shows only the words and the name; never the score, the contact or any other record. The public list is cached for about five minutes, so a change can take up to that long to appear.

Limits, stated plainly: showing a testimonial publishes only the words and name you approve, and changes no record of the sale or the customer.

### Management decisions and shift handover (Operations page, Decisions and Shift handover tabs)

**Decisions.** Write down each management decision as it is made: what was decided, the day, who owns it, the day it should be done by, and whether it is open, done or dropped. Only the owner and manager see this list. An open decision whose day is near or has passed shows on the Agenda, marked past its day when it is late. The tab shows how many are open and how many are past their day. Turn the Agenda reminder off under Automations if you do not want it there.

**Shift handover.** At the end of a shift, write what the next shift needs to know: stock running low, a customer waiting, equipment acting up, anything left unfinished. Everyone who works in the business can write and read handovers. The tab shows how many were written in the last seven days.

Limits, stated plainly: neither record posts to the books or moves stock, and no one is contacted from them. A decision's status is set by the person who records it; nothing closes a decision automatically.

### Shift swaps and escalations (Operations page, Requests and Escalations tabs)

**Shift swaps.** On the Requests tab, choose *Shift change*, then the shift from the next 30 days of the rota, and optionally the person who will take it. When an owner or manager approves the request, the shift moves to that person on the rota, in the same save as the approval. If the shift has been taken off the rota in the meantime, the approval is refused and nothing changes. A request without a person named is approved as before, and the manager sets the rota by hand.

**Escalations.** The Escalations tab lists everything in operations that is late or has waited too long: open management decisions past their day, incidents open for more than two weeks, corrective actions past their due day, risk reviews past their date, requests waiting more than three days, equipment services past their date, and expired compliance items. Each is marked high (a month or more late), medium (a week or more) or low, and sorted most serious first. Turn on *Show items a month or more overdue on the Agenda* under Automations to see the high ones on the Agenda as well.

Limits, stated plainly: an approved shift swap changes the rota shift and nothing else; no pay changes, and nothing is sent to the person. Escalations only list what is already recorded; nothing is closed or reassigned automatically.

### Where the money goes, exceptions, decisions and responsibilities (Cash page, Operations page)

**Where the money is going.** On the cash page, the bank balance is shown as three parts. First, what is already committed in the next 30 days: bills and payables due, loan installments, pay, recurring costs and rent. Those come out before anything else. Second, the operating reserve: the number of months of committed spending you choose to keep (three by default). Third, what is free to spend. The card also shows the balance week by week, and flags any week that closes below the reserve, so a gap appears weeks before it becomes a problem. Nothing is moved or recorded.

**Exceptions.** Normal activity is left alone; only deviations are raised, on the Escalations tab and on the Agenda if you switch that on. Two financial exceptions are checked: a price moved by 10% or more in the last 30 days (see Price history), and a payable overdue by more than seven days. The high level is a 50% price move or a payable 30 days late.

**Decisions.** Every decision needs an owner and a day it should be done by, and a decision is not left open without a date. Record the next best option that was given up for it; that is the opportunity cost, and it is what the decision should be measured against. On the Decisions tab, *Test a discount before deciding* shows what a discount does to the margin per unit, the contribution per period, and how much extra volume it needs to pay for itself. It saves nothing; write the decision once you have looked at the result.

**Responsibilities.** On the Responsibilities tab, each area of work names who is responsible for it (does it), who is accountable (answers for it), who is consulted first, and who is informed after. An area with no one responsible is flagged. The point is that the business does not depend on one person for any area.

**KPIs with an owner and a decision.** A KPI can name who is accountable for it moving, and the decision it informs. A KPI with no decision behind it is flagged as such, because a number nobody acts on is not steering anything.

Limits, stated plainly: none of these moves money or closes a record. The cash figures are a forecast from what is already recorded, not a bank balance. A decision is closed by the person who records it, not automatically.

### Capacity: can the team cover what is booked? (Operations page, Capacity tab)

For each of the next two weeks, the Capacity tab compares the hours the team is rostered to work with the hours booked. Anyone on approved leave is taken out of the rostered hours for that day. Cancelled and no-show bookings are not counted as demand. Each day is marked: more booked than rostered (a problem), booked with nobody rostered (a problem), nearly full, balanced, spare, or nothing booked. The problem days come first.

On the Agenda, a day in the next week that is booked beyond the rota, or booked with nobody rostered, is listed as an action. Owners and managers only, because leave is only visible to them; turn it off under Automations if you do not want it there.

Limits, stated plainly: capacity is a view of what is already rostered and booked. It changes no shift and no booking, and nothing is sent to anyone.

### Management review: the agenda, built for you (Operations page, Management review tab)

The Management review tab builds the agenda for the operations and management meeting from the records as they stand, so nothing has to be gathered by hand. It lists, most serious first: overdue and late items from the escalation list; decisions that are open and due within two weeks (and any that are past their day); numbers off target, with a flag where no decision is linked to them; days the team cannot cover; licences, insurance and contracts expired or due soon; incidents still open; risks due for review; objectives behind their date; and the ownership gaps, meaning areas with no one responsible, requests waiting, and procedures still to be read. Empty sections are left out.

Press **Copy the agenda** to take it into a note or a message. The text ends with the instruction the review should follow: for each item, decide, name the owner, and set the day it will be done by. Balancr sends nothing.

Limits, stated plainly: the review reads what is already recorded and changes none of it. Nothing is closed, decided or sent by building it.

### Coverage: who can do each procedure (Operations page, Coverage tab)

For each written procedure, the Coverage tab lists the people who have read and acknowledged its current version. A procedure nobody is qualified for is flagged first, then one that only one person is qualified for: when that person is away, nobody can do it. Someone who has only read an earlier version is listed as still to read. The Management review agenda raises the same gaps under ownership and people, so they are discussed at the review.

Limits, stated plainly: coverage reads the acknowledgements already recorded. It changes no procedure and assigns no one.

### Scorecard colours and the weekly review (KPIs, Operations page)

Every KPI shows a colour. **Green** means the latest reading meets the target. **Amber** means it misses, but by no more than the amber band, which is 10% of the target by default and can be set per KPI ("Amber if within"). **Red** means it misses by more than that. A KPI with no reading has no colour. Red and amber numbers come first on the management review.

On Mondays, the Agenda lists the weekly operations review: how many items need a decision. It is the same agenda as the Management review tab. Owners and managers only, and it can be switched off under Automations.

Limits, stated plainly: colours are judged from recorded readings against the targets set; no reading is invented, and no target is changed.

### Supplier performance and leavers (Operations page, Supplier performance and Leavers tabs)

**Supplier performance.** Worked out from your purchase orders: for each supplier, the share of deliveries that arrived on or before the expected day, how late the late ones were on average, how far the price paid moved from the price quoted, and how many orders are overdue now. A supplier is *poor* below 80% on time and *watch* below 90%, once there are at least three deliveries to judge. Poor and watch suppliers, and any with overdue orders, appear on the Management review agenda.

**Leavers.** Choose the person leaving to see the steps that close their access and equipment, and everything they still own: KPIs they are accountable for, open decisions they are making, and areas of work they are responsible for. Each item is listed so it can be handed to someone else on purpose.

Limits, stated plainly: supplier figures are read from the orders already recorded, and the leaver view reassigns nothing. Changing an owner is done on the item itself.

### Venue clashes: events and bookings sharing a room (Events page, Capacity tab)

Each event now says which room or stage it runs in, and how long it runs (180 minutes by default). When an event shares a room with a booking, and the times overlap on the same day, the Capacity tab lists it as a venue clash, with the booking it collides with. A blank room is the main lane, the same lane a booking with no room uses. Cancelled events and cancelled bookings never clash.

Limits, stated plainly: a clash is shown, not blocked. Nothing is moved, cancelled or sent to anyone by finding it.

### Sales drop alert (Operations page escalations, Agenda)

Sales are compared week by week. The last seven days, today included, are measured against the average week of the four weeks before them. When sales fall by 40% or more, an exception is raised on the Escalations list: medium at a 50% drop, high at 60%. It also appears on the Agenda if the high-severity escalation switch is on.

No alert is raised when the baseline has fewer than eight selling days, because there is nothing reliable to compare against. A sale with no quantity or no value is ignored.

Limits, stated plainly: the alert reads sales already recorded and changes none of them. A drop is a signal to look at, not a conclusion about the cause.

### Standard sales measures (Operations page, KPIs)

Three sales measures are worked out for you from the sales and leads already recorded: **average order value** (revenue over the last 30 days divided by the number of orders), **repeat customers** (customers with two or more orders in the last 90 days, as a share of everyone who ordered), and **lead conversion** (leads won as a share of the leads that came in over the last 30 days). Each shows its current figure on the KPIs page.

Press **Track it** to add one as a measure. Its figure then follows the live calculation, so nothing is typed in each period. The starting target is today's figure; change it on the measure. A measure can be set to be typed in by hand instead, in the measure's form. A measure with no data yet shows no colour, not red.

Limits, stated plainly: these figures only read the sales and leads already recorded; nothing is changed, and a low figure is a prompt to look, not a diagnosis.

### Sales team scorecard (Operations page, Sales team tab)

Each salesperson's last 30 days, worked out from the sales recorded against them and the leads they own: revenue, number of orders, average order value, leads that came in, leads won and the conversion rate. Sales that were not recorded against a person are shown on their own line.

Set a monthly revenue target for each person under *Monthly revenue targets* (leave it empty for none). Their revenue over the last 30 days is then shown as a share of that target. Anyone under 70% is flagged *behind target*, listed first, and raised on the Management review agenda.

Limits, stated plainly: the scorecard reads the sales and leads already recorded; it changes no sale, lead or target except the targets you type in, and it judges no one beyond the figures and the target you set.

### Cycle counts: count the valuable stock most often (Operations page, Cycle counts tab)

Stock is classified by value. The most valuable items that make up the first 80% of stock value are **class A**; the next items, up to 95%, are **class B**; the rest are **class C**. A items are due a count every 30 days, B every 90 days, and C once a year. An item's last count is the latest count recorded for it on the Products page (Count stock). Breakage, theft and other losses are not counts.

The Cycle counts tab lists what is due, most valuable and most overdue first. On the Agenda, the high-value items due a count appear as one line each day, for owners and managers; turn it off under Automations if you do not want it there.

Limits, stated plainly: the plan reads the stock ledger and recorded counts; it changes no stock. Counting is done on the Products page, and that is what updates the plan.

### Starter setup: a first set for your kind of business (Operations page, Starter setup tab)

A new business should not start from an empty page. Choose the closest kind of business (shop, food, services, making things, venue, wholesale, or something else) and press **Add this starter set**. It adds a first set of measures, each with the decision it informs and a sensible target, areas of responsibility, and standard procedures such as opening and closing checks. Everything added is a starting point: change the targets, the owners and the steps to suit the business.

Only what is missing is added. Anything already there with the same name is left alone, so the set can be applied again safely, and after an interruption it adds the rest. The kind of business is remembered.

Limits, stated plainly: the starter set adds records only. It sets no real target you have not chosen, assigns no real person (each area names the owner until you change it), and changes nothing already recorded.

### Stock priorities: where the money goes, and what to do with stock that stopped selling (Operations page, Stock priorities tab)

**Where the money goes.** Each product is placed on a grid of recent demand (units sold in the last 90 days) against margin (the gap between the selling price and the cost). The split is at the middle of your own products, so the grid is relative to your business. High demand and high margin: protect it and keep it in stock. Lower demand but high margin: promote it. High demand but low margin: check the price or the cost. Lower on both: review it, reduce or stop buying. A product with no selling price cannot be judged and is listed last.

**Stock that has stopped selling.** Stock with no sale in 60 days, or never sold, is listed with the cash each markdown would release (20%, 35% and 50% are shown). Stock idle for 90 days or more is advised to clear at any price that still covers its cost. A price below cost is shown but not advised. Stock idle for less is held. Your own judgement on the price stays with you.

Limits, stated plainly: these are estimates from recorded sales and stock. Nothing is priced, ordered or marked down by them.

### Month-end close checklist (Operations page, Month-end close tab)

Pick a month and the checklist shows each step needed before its books are locked, with its status read from the records: bank lines matched, cash counted, stock counted (if you hold stock), overdue customers (more than 60 days late) chased, overdue bills dealt with, expenses recorded, and sales recorded.

When every step is done, **Lock the books through** the month's last day is offered. You confirm it, and it uses the same closed-period rules as the books' lock date, so a mid-month date is refused. Once locked, nothing dated on or before that day can be changed.

Limits, stated plainly: the checklist reads the records and changes none of them. Locking is a separate step that only the owner or manager takes, and it changes only the lock date.

### Accruals: costs used this month but billed later (Month-end close tab)

When something is used in a month but the bill arrives later, record it as an **accrual** on the Month-end close page: what it is, the estimated amount, the category, and the month it was used. It counts in that month's profit, and reverses automatically on the first day of the next month. When the real bill is recorded in the next month, the cost is not counted twice. An accrual is not cash: it never changes the cash runway or the cash paid, and it appears on the balance sheet as an accrued liability until it reverses.

Once the month is closed, its accruals cannot be removed, and an accrual cannot be added to a closed month or to one whose reversal would land in a closed month. If a month has no unbilled costs, confirm it on the same page; the close checklist then counts that step as done.

Limits, stated plainly: an accrual is an estimate you enter. It is not a bill, and it is removed only while its months are open.

### Operations events to your automation tool (Integrations > Automations, webhook address)

The webhook address you set for new leads also receives two operations events: an **incident opened**, and a **purchase order approved**. Each carries the event name, the time, and only what a routing step needs (for example the incident's date, place, severity and description, or the purchase order's product, quantity, supplier and due day). Costs and personal notes are left out. The record is re-read on the server before it is sent, and a failure to send never undoes the record itself.

### Cost variance: what a purchase was quoted against what it cost (Operations page, Cost variance tab)

For each received purchase that has a paid price, the tab shows the quoted unit cost, the price actually paid, the percentage difference, and the money impact across the units received. Purchases at or beyond 5% either way are flagged. The impact is positive when a purchase cost more than quoted and negative when it cost less. Totals are given by supplier, so a supplier who drifts above quote shows up without anyone checking each invoice.

Limits, stated plainly: this compares figures already recorded on the purchase orders. It restates no cost, changes no stock valuation, and sends nothing to a supplier.

### Orders against supplier invoices (Operations page, Cost variance tab)

The top of the Cost variance tab checks that every received purchase order has one purchase (the supplier's invoice, as booked) for the same quantity. It lists three kinds of problem: a received order with no purchase recorded against it; a quantity that differs between what was received and what was booked; and a purchase bought without an order, or one that refers to an order that no longer exists. Orders not yet received are not judged.

Limits, stated plainly: the check reads the records and posts nothing. Fixing a problem is done on the record itself.

### Marketing and sales costs: entering them (Expenses page, Settings)

Marketing and sales costs are costs like any other, and they reach the profit figures as selling costs. Enter them as an expense in the **Marketing** or **Sales payroll** category (and **Transport & logistics** for deliveries). Each category has its own monthly budget.

Ad spend from an ad account can be imported on the Settings page, where it is used to compare what each promo code cost with the sales it brought in. Importing alone adds nothing to your costs. After an import, press **Record as Marketing costs** to record each campaign's amount as one Marketing expense for the period. A campaign already recorded for that period is skipped, so pressing it twice adds nothing.

Limits, stated plainly: recording is always your choice. Ad spend is only recorded when you press the button, and the amounts are the ones the ad account reported.

### Connecting outside services: paste a key (Integrations page)

Every outside service is connected the same way: open Integrations, choose the service, paste the key or credentials its provider gives you into the fields, and switch it on. There is no sign-in with another account and no setup on the server. The services available are PayHere (payments), the AI assistant (DeepSeek), email, WhatsApp, SMS (Notify.lk, with its user ID, sender name and key), and the lead API key, which takes new leads, reviews and web orders from Zapier, Make or n8n.

A service only appears on the page if the app reads what you paste. Services that needed an account sign-in, or that the app does not yet read, are not offered until they are built.

Limits, stated plainly: the keys are stored for the business only, shown masked, and left out of backups. Switching a service off stops the app using its key without deleting the key.

### Process map and scheduled jobs (Procedures, and your host)

**Showing a process as a flow.** Open any procedure and press **Show as a flow**. Its numbered steps are drawn in order, from start to done. **Copy the diagram code** gives a text version you can paste into any free diagram tool that reads Mermaid, when you want a styled chart. Steps are the numbered lines of the procedure; a line without a number continues the step above it.

**New products and services.** The starter set includes a standard procedure for launching a new product or service: cost it, price it, check the margin, write how it is delivered, record the approval as a decision with an owner and a day, train the people involved, then review the first month. Use a decision (Decisions tab) for the approval itself.

**Scheduled jobs.** The daily job sends reminders, creates due recurring items and sends the digest. If your host runs its own timer (the app ships with one for daily runs), nothing is needed. If it cannot, the repository includes a scheduler file (`.github/workflows/daily-job.yml`) that calls the job every day. Set two secrets in the repository: `CRON_SECRET`, the same value as on the site (at least 16 characters), and `SITE_URL`, the site address.

Limits, stated plainly: the flow only draws what the procedure already says. The scheduler only calls the daily job; it changes nothing by itself.

### Packages, rentals, recurring work, and the two design gaps

**Prepaid service packages.** A package sold at a fixed price and drawn down by bookings is a membership: a bank of included hours with a first and last day. Unused hours lapse after the last day. To sell a package of sessions, set the hours to the length of the sessions multiplied by the number, and name it for what the customer bought.

**Rentals, recurring income and expenses, retainers, projects, jobs and consignment** are all tracked in their own sections.

**Service blueprint.** The services starter set includes a procedure with a fixed structure: the steps the customer sees, the staff steps behind them, the systems each step needs, the points where things go wrong, and the evidence of good work. Use it to design a service before you launch it.

**Editing the process map.** The flow shown for a procedure is drawn from its numbered steps, so editing the procedure edits the flow. The copied diagram code can be edited in any Mermaid diagram tool.

Limits, stated plainly: none of this changes a booking, a membership or a price; a package's hours are whatever you set when you sell it.

### Franchise royalties (Operations page, Royalties tab)

A site that pays a royalty to head office pays a share of its sales each month. Set the royalty rate for each location on the tab (leave it empty for a location that pays none). The royalty for each month is worked out from the sales recorded at that location; sales with no location belong to the main location. Choose the month, then press **Record royalties as costs** to record each site's royalty for that month as one overhead cost for the site, dated the last day of the month. A site already recorded for the month is skipped, so pressing again adds nothing.

**Statement file.** **Download the statement (CSV)** gives one row per paying site for the month: the period, the site, its sales, the rate, the royalty due and the currency, under plain column names. Text that could run as a formula in a spreadsheet is made safe before the file is saved.

Limits, stated plainly: the royalty is a share of recorded sales at the rate you set; it changes no sale, price or location. Nothing is paid or invoiced to head office by it; the cost is recorded in the books of the business that holds the record.

### Royalties to head office, both ends (Royalties and Royalty inbox tabs)

**Head office.** On the Royalty inbox tab, enter a site's business ID and press **Make a key**. Each site gets its own key, shown once: copy it and give it to that site, with your business ID. Each statement that arrives waits in the inbox. **Confirm and book as income** records the royalty as income once; a statement is never booked twice for the same site and month, even if a retry happens part way. **Decline** books nothing.

**The site.** On the Integrations page, set the royalty connection to head office: head office's business ID and the key it gave you. On the Royalties tab, choose the month and press **Send to head office**. The site's identity is taken from its own sign-in, not from what the browser sends. Sending a month twice does nothing the second time.

Limits, stated plainly: sending books nothing at either end. Head office books income only when it confirms. Head office keeps only a hash of each site's key, so a key cannot be read back later: if it is lost, press **New key** for that site. **Revoke** stops a site's statements at once.

### Investment appraisal: should we invest? (Operations page, Investment appraisal tab)

Each project is one line: its name, the money out now, and the cash it brings in each year after tax. At the discount rate you set (a risk-adjusted rate, as a percentage a year), the tab shows for each project:

- **Net present value**: the value it adds, in today's money. Positive creates value; negative destroys it.
- **IRR**: the return the project earns on its outlay, where it is shown as none when the figures have no meaningful return.
- **Payback**: how many years until the money back, undiscounted.
- **Profitability index**: what comes back for each unit invested. Above 1 creates value.
- **Equivalent yearly value**: its value spread evenly over its life, for comparing projects of different lengths.

If you enter the money available, the tab funds the projects with the highest profitability index while the money lasts, and says which are skipped. A project that does not fit is skipped, not split. Enter the expected inflation to see the discount rate after inflation. Finally, enter the forecast and actual cash for a project that is under way: the tab shows whether it is behind the case that justified it.

Limits, stated plainly: the figures are estimates from the cash flows you enter. The tab saves nothing and spends nothing. Sensitivity to the discount rate and the cash flows is for you to test by changing them.

### Loan offers and the choice to wait (Operations page, Loans and waiting tab)

**Loan offers.** Enter each offer on one line: name, amount, annual rate, months, and any upfront fee. Each offer shows its monthly repayment, the total cost (everything paid beyond the amount borrowed, fee included), and its real annual cost. The real annual cost is higher than the headline rate when there is a fee, so compare offers on it. Enter the money you can spare each month and each offer shows whether its repayment fits.

**Invest now or wait.** Enter the money out, the value if you invest now, the value if the project goes well or badly in a year, the chance it goes well, and the discount rate. The tab shows what waiting is worth and what investing now is worth, and recommends waiting only when waiting is worth more. Waiting is worth something because, if it goes badly, you do not invest.

Limits, stated plainly: the figures are estimates from what you enter. Nothing is applied for, agreed or saved here.

### A staged project: can we stop part way? (Loans and waiting tab)

Some projects unfold in stages, and at each stage you can carry on or stop. Enter the number of stages, the value of what the project produces today, the factor by which it rises or falls each stage, the chance it rises, the discount rate per stage, the cash it yields each stage as a share of its value, the cost to carry on each stage, and the salvage value if you stop. The tab shows the value with the choice to stop at each stage, the value if you were committed to the end, and what the choice to stop is worth. If stopping now is worth more, it says so.

Limits, stated plainly: the figures depend on the chances and factors you enter, which are estimates. Each stage is one step of a simple up-or-down tree; it does not model several uncertain factors at once. Nothing is saved.

### Estimating a staged project from your own history (Loans and waiting tab)

The staged project needs a chance of a rise and the rise and fall factors. Rather than guess them, the tab reads your monthly revenue for the last months and shows what it suggests: how often revenue rose, and by how much on average when it rose and when it fell. **Use these** fills them in. You can still change them.

It needs at least six months of revenue with both rises and falls. Months with no revenue are left out. The figures describe past behaviour; they are a starting point to check against what you expect, not a forecast.

### Thousands separators, and importing from any POS (every amount field, Import/Export)

**Typing amounts.** Every amount field shows thousands separators as you type: 500,000 and 5,000,000 read at a glance. The number is stored plainly, so nothing else changes. Four digits and more get a separator; decimals are kept as you type them; a minus sign is allowed.

**Any POS.** There is no single export format across tills and online shops, so the app matches the column names in your export to what it needs (item, quantity, price, date, customer, notes), recognising the wording of the common platforms (Square, Shopify, Clover, Toast, Lightspeed, WooCommerce and others). You confirm the match and see a preview before anything is saved, and the match is remembered for the next export of the same shape.

Limits, stated plainly: an export is only as complete as the file you give the app; a column the matcher does not recognise must be matched by hand; and the import records what the file says, nothing more.

### Quantity pricing: checking a bulk deal (Operations page, Quantity pricing tab)

Choose a product or service, the quantity, the discounts for quantity (for example "10:5, 50:10" means 5% off from 10 units and 10% off from 50), and the lowest margin you accept. The tab shows the total at the discount, the margin left on the discounted price, and whether that margin is below your floor.

Limits, stated plainly: this is a check before a deal is agreed. It records no sale, changes no price and sends nothing to the customer. The discount is the deepest tier the quantity reaches; tiers do not stack.

### Sourcing risk: how dependent you are on each supplier (Operations page, Sourcing risk tab)

Over the last twelve months of purchases, the tab shows how much you spend with each supplier and what share of spend each takes. A supplier taking 50% or more is flagged as a single point of failure. It also lists the products you buy from one supplier only. Purchases with no supplier recorded are shown as such and are not counted as single-sourced; record the supplier to bring them into the picture.

Limits, stated plainly: it measures spend and sources as recorded. It does not judge a supplier's quality or find alternatives for you; that is for you to decide.

### Cycle time and promises kept (Operations page, Cycle time tab)

The tab measures time from dates you already record. **Suppliers:** for each supplier, the average days from order to receipt, and how late its receipts are on average against the day it promised (only receipts with a promised day count for lateness). **Projects:** for each completed project, how long it took from its start, and its buffer: the days it finished before its promised end date. A negative buffer means the promise was missed. The tab shows how many promises were kept and the average buffer.

Limits, stated plainly: the measures are only as good as the dates recorded. Promised delivery dates for goods sold to customers are not recorded by the app, so they are not measured here; projects and supplier deliveries are.

### Promised delivery to customers (Operations: web orders and Cycle time)

**The promise.** When your shop or site sends an order, it can include the day the customer was promised their goods (`promisedDate`, as YYYY-MM-DD). It is checked like every other date, and an order without one is still accepted.

**Recording the delivery.** On the web orders list, a confirmed order shows **Mark delivered today**. Pressing it records the day it was delivered against the promise.

**What you see.** The Cycle time tab lists how many delivered orders were on time or late, the average buffer (positive means delivered early), and every confirmed order past its promised day with nothing recorded as delivered, with how many days overdue it is.

Limits, stated plainly: the measures use the dates recorded. "Mark delivered today" records the day you press it, so press it on the day the goods leave or reach the customer, whichever your promise is for.

### Recruiting: from application to hire (Operations page, Recruiting tab)

Add each person who applies, with the role, the day they applied, and optionally where they came from and how to contact them. Move them along as hiring goes on: **Move to interview**, **Move to offer**, **Hire**, or **Not taken forward**. Each stage is dated the first time it is reached, so the record shows the whole path.

The tab shows how many candidates are at each stage, the average time to hire (from applying to being hired), anyone who has waited at least 14 days in one stage, and hires whose onboarding has not started. **Onboarding started** clears a hire from that list.

Limits, stated plainly: the tab records what you enter and when you move a candidate. It does not contact anyone, and it does not judge candidates. A candidate who is not taken forward keeps their path, so the record stays complete.

### Pre-hire checks, exit records and tax set-aside (Operations page)

**Before hiring (Recruiting tab).** Each candidate has two dates to fill in: when references were checked, and when the right to work was checked. The **Hire** button stays off until both are recorded on a day that has come. The app keeps the fact and the day only; never ID numbers or documents.

**Exit records (Exit records tab, owner only).** For each leaver: the day the exit interview was held, what it covered, the severance or final settlement you agreed, and how it was worked out. The app does not calculate severance, because the rules depend on the country. Only the owner can see or change these, since they hold pay and personal notes.

**Tax set-aside (Tax set-aside tab).** Shows the income tax on the year's profit, at the rate set in your settings, less the tax already paid, so you know how much cash to keep back. It also says whether cash on hand covers what is outstanding. A loss-making year owes nothing, and losses are not refunded by the figure. It is an estimate on the profit recorded, and should be checked with your accountant.

Limits, stated plainly: the checks record what you did and when; they do not carry out the check. The tax figure follows the rate and the profit in the books, so keep both accurate.

### Obligations calendar: filings, returns and renewals (Operations page, Obligations calendar tab)

Add each filing, return or renewal your business must make, with the next day it is due and how often it comes back: once, monthly, quarterly or yearly. The calendar lists overdue items first, then anything due within two weeks, then the rest. When a repeating item is marked done, its next due day is set automatically from the day it was due, so an early or late filing does not shift the rhythm. Marking a deadline done is a record of what was done; the app files nothing with any authority.

Limits, stated plainly: the calendar keeps the dates you enter. It does not know the rules of your country, so check each date with your accountant or the authority concerned. Removing a deadline removes it from the calendar only.

### Succession and the organisation (Operations page, Succession and organisation tab)

Set who each person reports to, and who covers for them when they are away. The tab draws the organisation from those lines. It also lists the **key people without a named deputy**: someone who is the only qualified person for a procedure (matched through their acknowledgement of the current version), or who leads three or more people. Naming a deputy clears that person from the list. A reporting line that loops back on itself is reported, so you can fix it.

Limits, stated plainly: procedures are matched to people through their acknowledgement, so each person must have acknowledged the current version to count as qualified. Names are matched exactly, so keep them the same across the team and the procedures. The tab records who reports to whom and who covers whom; it does not change anyone's role or access.

### Feedback loops: changes from customers, and alternative suppliers (Operations page, Feedback loops tab)

**Product improvements.** When a customer complaint or suggestion, or an idea from the team, should change something, record it here with a short description (at least eight characters), who will make the change, and the day it should be done by. Overdue changes are flagged. Mark each one done when it is made, or drop it if you decide against it. The tab shows how many customer ideas have been acted on, so you can see the loop closing.

**Supplier alternatives.** Each product bought from one supplier only is listed. For each, record another supplier that could supply it, with their price per unit. The tab compares that price with what you pay now and says whether it is cheaper, and by how much. Set each alternative to considering, trial, approved or rejected. A product with no live alternative is flagged.

Limits, stated plainly: the loops record and track what you decide; they do not change a price, place an order, or contact a supplier or customer.

### Measures for the dashboard: leading and lagging (Records: Measures)

Keep the management dashboard to five to seven measures, with both kinds. A **leading** measure predicts a result (orders in progress, calls made, a quote pipeline); a **lagging** measure records one (revenue, cash collected). Label each measure when you add it or change it. The Measures screen counts them and says what to add, cut or label. A measure with no label is counted, so it is not missed.

### Scenario plan: what the business earns, weighted by chance (Operations page, Scenario plan tab)

Instead of one forecast, set several scenarios, each with the chance it happens (the chances must add up to 100%). Each scenario changes revenue by the percentage you set; one can also lose the business's largest customer, whose share of sales over the last year is taken from your records. Revenue, the margin and that customer's share come from the books; the fixed costs and the chances are yours. The tab shows the profit each scenario gives a month, the expected profit weighted by the chances, the chance of losing money, the break-even revenue, and how much a 1% change in revenue moves profit.

Limits, stated plainly: the chances are your judgement, not something the app predicts. Nothing is saved.

### Financial complexity: what adds admin without earning much (Operations page, Financial complexity tab)

**The definition.** Complexity is the cost of carrying items that earn little. The review counts three things from your records: products selling under 1% of revenue over the last twelve months, suppliers taking under 1% of spend, and monthly recurring costs under 0.2% of monthly revenue. A business with three or fewer such items is **simple**; more than ten is **complex**.

**What to do.** Each item is listed with what it earns or costs, and the weakest first. Keep a small product only if it brings customers or is required. Consolidate a small supplier with a larger one. Bundle or drop a small recurring cost.

Limits, stated plainly: the review reads the records and changes nothing. The thresholds are set in the rules and are the same for every business; judge each item against your own situation.

### Market rates: what the market charges, against your price (Products, and Operations page, Market rates tab)

On any product or service, the form has an optional **Market rate**: what the market charges for it, and where you checked (for example a competitor's list, or a supplier's published price). When you change the figure, the day it was checked is recorded automatically.

The Market rates tab compares each product or service that has both a market figure and a price of its own. It shows whether you charge above, below or level with the market (level means within 2%). A gap of 10% or more is flagged. A figure checked more than 90 days ago is marked to check again. Items with a market figure but no price of their own are counted, so they are not missed.

Limits, stated plainly: the market figure is what you enter, not a live price from the market. The tab changes no price; deciding whether to move your price is yours.

### Delivery runs for a distribution business (Operations page, Delivery run tab)

For each confirmed customer order not yet delivered, set the driver and the area or route on the order. Choose the day, and the tab lists every delivery due by then, grouped by driver and ordered by promised day, with overdue stops marked and orders without a driver kept on their own sheet so none is missed. **Print the run sheet** gives a sheet for the van; **Delivered today** records the delivery.

### Sales commissions, for a sales team

Each salesperson with a commission rate has it worked out for each month from the sales made under their login, less the returns and discounts on those sales. It can be a percentage of sales, or of the profit those sales leave. Record the amount as an expense when you pay it. Commission tiers, where the rate rises with the share of a target achieved, are not built; the rate is one figure per person.

Limits, stated plainly: the run sheet reflects the orders and the driver and area you set; it does not plan routes or track vehicles. Commissions are worked out for you and nothing is paid by the app.

### Buying prices against the market, commission tiers, and automatic operations measures

**Buying side of market rates.** On a product, the form takes an optional **Market cost**: what suppliers charge the market for it, where you checked, and when. The Market rates tab compares what you pay now with that figure. Paying 10% or more above the market is flagged; it is the warning case.

**Commission tiers.** On an employee, the optional tiers say "from this share of the monthly sales target, this rate", for example `100:8, 120:10`: 8% once they reach 100% of target, 10% at 120%. The highest tier reached sets the month's rate; without a target, or without tiers, the single rate applies as before. The commission line shows the share of target achieved and the tier used.

**Automatic operations measures for KPIs.** A measure can now follow one of six figures the app works out from its own records, so nobody types them in: customer deliveries on time, supplier deliveries on time, staff turnover over the last year, overdue filings and renewals, overdue changes from feedback, and average time to hire. A figure with nothing to measure yet is left empty rather than shown as zero.

Limits, stated plainly: market figures are what you enter, not live quotes. A commission tier changes the rate only from the month you set it, and it does not pay anyone. The automatic measures describe the records as they stand; they do not correct them.

### Packages and productized offers, made easier (Offers page)

When you create a new offer, you first see four starting shapes: a single service, a package of sessions (ten by default), a monthly retainer, and a product bundle. Choosing one fills in the name, the category, the capacity and the cost lines to complete; everything can still be changed.

The offer form then works out the price for you. Enter the cost of delivering one unit in the cost lines and your **target margin**; the form shows the price that leaves that margin, with **Use the suggested price** to take it. As you type a price, the form shows the margin it leaves and the profit per delivery.

Limits, stated plainly: the suggestion is arithmetic on the costs you enter, not a view of what the market will pay. Check the price against the market rate you have recorded, if you have one.

### Business types, and the screens they show (Operations page, Starter setup)

Choose the kind of business that fits best. There are eleven, including hire or rental, trades or construction, membership, and consultancy or billed time. The kind sets the starting measures, areas of responsibility and procedures.

It also shapes the screens an owner or manager sees. A services, consultancy or membership business does not see the stock count, royalty, delivery run, sourcing or cost variance screens; a hire business does not see the delivery run; a trades business does not see royalty screens. Core screens are always shown: requests, procedures, starter setup, compliance, KPIs, reviews, risks, quality, incidents and equipment. Staff keep the screens their role was given.

Turn on **Show every operations screen** in Starter setup to see everything again, whatever the kind.

Limits, stated plainly: hiding a screen does not delete its records, and nothing is lost by changing the kind. The rule is set in the app; it is not a judgement about your business, so use the option if a screen you need is hidden.

### Workplace policies, and retiring a product or service (Procedures)

Every business starts with the procedures for leave and absence, conduct and safety, and customer and staff data. They are procedures like any other: staff acknowledge each version, and the acknowledgements show who has read the current one. The starter set also includes a procedure for retiring a product or service: check the stock left, set the clearance price, tell customers what replaces it, and set the item to inactive once the stock is cleared.

Limits, stated plainly: the policies are starting text to adapt to your own rules and to the law where you operate; the app does not give legal advice. Business continuity planning sits in the risk register under its continuity category.

### Draft orders each day, and likely order matches (Purchase orders, Three-way match)

**Draft orders.** Turn on **Make draft orders for the items that are due each day, for me to review** on the buying list. The first time the buying list is opened each day, every item that is due, has a known cost and has no open order becomes a **draft** on the Purchase orders screen. Nothing is sent. Send a draft to supplier when you have checked it: it is placed, or waits for approval if it is above your approval amount. Discard a draft you do not want.

**Likely order matches.** On the three-way match screen, a purchase with no order shows the received order it most likely came from (same supplier, product and quantity). Linking is still yours to do, so the records stay exactly as you set them.

Limits, stated plainly: drafts are made when the buying list is opened, not when the app is closed, so they appear on the first visit each day. Nothing is sent or linked without you. Route planning by distance is not built: deliveries need a customer address, which orders do not carry yet.

### Customer addresses and delivery runs

The shop can send a **customer address** with each order (optional). The run sheet shows it under each stop, and within an area the stops are listed in address order, so a driver's list runs along the road. An order with no address still arrives; it simply shows none.

Limits, stated plainly: stops are ordered by address text, not by distance. Distance-based routing needs a maps key and each address located on a map. Addresses come from the shop; they cannot be edited on the order here yet.

### Finding any screen quickly (every page)

Press **Ctrl+K** (or **Cmd+K** on a Mac), or **/** when you are not typing, to open the screen finder. Type a few letters: names that start with them come first, then names with a word that starts with them, then names with the letters inside them, then screens in a matching group. Use the arrow keys to choose, **Enter** to open, **Esc** to close.

The finder only lists screens you can already see: your role and any screens you have hidden decide what appears.

### Screen order in the sidebar and the finder

The sidebar and the screen finder show screens in one order, so the same screen is always in the same place. Groups come in this order: Overview, Buy & sell, Money, Team, Admin. Inside each group, screens run from the most used to the least: for example in Money, Invoices and Bills come first, and in Team, Team access comes last. A screen that is not yet in the order appears last in its group, so nothing is lost.

### Group view: all your businesses together (Operations page, Group view, owner only)

If one login runs several businesses, the **Group view** adds them together by month: revenue, cost of sales, costs and tax, and net profit, for the last twelve months.

**Setting it up.** Each business publishes its monthly summary while an owner or manager has it open, so open each business once after setting it up. In Group view, tick the businesses to include.

**Transfers between your businesses.** If one business supplies or sells to another, record the transfer in Group view with its month and amount. It is taken out of revenue and cost on the group totals, so it is not counted twice. The group profit is unchanged by it. The transfer is not posted to either business's own books.

Limits, stated plainly: a group is the businesses one login owns or manages; businesses under different logins cannot be grouped. Businesses must use the same currency; no currency conversion is made. Figures are as each business shows them, and a business that has not been opened recently may show older figures. The group view is for your own management, not a statutory consolidation.

### Contracts, and the renamed and moved screens

**Contracts (Operations page, Contracts tab).** Record each contract the business has signed: what it is for, the other party, its kind, the start day, the end day (or none for open-ended), the notice needed to end or change it, and what it is worth a year. Contracts that need a decision show first: those whose notice window opens within 60 days. A contract past its end shows as ended. Use "Make it open-ended" to clear an end date. Signing and e-signature are not done here; keep the signed copy with the record in your document system.

**Navigation.** Opportunities now sits in Buy & sell, next to Leads and Estimates. Jobs is now "Jobs (short work orders)" and Projects is "Projects (longer client work)". The two loan screens are "Loans & credit (borrowed)" and "Credit given (lent out)". Niche screens that do not fit your type of business are kept out of the menu: for example, a consultancy does not see the kitchen or tabs. "Show every screen" in Starter setup shows everything again.

Limits, stated plainly: the register records contracts; it does not enforce them or send notices. Payroll, leave, timesheets and expense claims already exist in the app, and payroll does not pay anyone.

### Healthcare: clinics, pharmacies and care services

Choose **Clinic, pharmacy or care service** as the kind of business to start with measures for missed appointments and out-of-stock medicines, areas of responsibility for bookings, stock and clinical checks, and a standard procedure for checking in a patient. The menu hides screens that do not fit a healthcare business, such as the kitchen, tabs and royalties.

Limits, stated plainly: the app keeps operational records. It does not hold clinical records, prescribe, or replace the regulatory and clinical systems your profession requires. Check any clinical or data-protection obligations with your regulator.

### Bank rules, and groups in different currencies

**Bank rules (Bank reconciliation page).** Write a rule once for a line that keeps coming back: when the description contains some text (for example "DD RENT"), and the money is in, out or either, then either **ignore it** (transfers between your own accounts) or **match it to an entry** (for example Rent). Press **Apply the rules** to the undecided lines. A line is matched only when exactly one entry with that label has the same amount (within one unit) and a date within three days. A line that could be more than one entry, or that no rule covers, is left for you. Rules only mark lines matched or ignored. They never change the books, and each mark is stamped with who made it.

**Groups in different currencies (Group view).** Each business keeps its own currency. Choose a reporting currency for the group and enter how many units of it one unit of each other currency is worth. Save the rates; they are dated when you save them. The group converts each business at those rates and adds them up. Transfers between group businesses are entered in the reporting currency.

Limits, stated plainly: rates are the ones you enter. The app does not fetch live exchange rates, so update them when they matter to your figures. Bank rules do not read a bank feed; they work on the statement lines you import. A group's figures are only as current as each business's last published summary.

### Profit split: where the revenue goes (Operations page, Profit split, owner only)

The screen follows the money from the top of the business down: revenue, then gross profit (and its share of revenue), then net profit after everything the business pays (and its share). Then it shows what was put back into the business (reinvestment) and what the owner took home, each against a target you set as a share of revenue. For example, 8% reinvested and 2% taken home: on 25m of revenue, 2m and 0.5m. It says whether the net profit covers both targets, falls short by how much, or whether there was a loss.

Actuals come from your capital entries: money recorded as reinvestment, and owner withdrawals. An outside investor's money returned to them is not counted as the owner's take-home. Choose the months to show; the default is the last twelve.

Limits, stated plainly: the targets are your choice, not advice. Reinvestment and take-home only show what you have recorded as such, so record each one when it happens. The split is arithmetic on your figures, not a tax or distribution calculation.

### Return on the capital the business uses (Profit split screen)

The profit split screen also shows the **return on invested capital**: the operating profit after tax (profit before tax, with interest added back, taxed at your income tax rate) divided by the capital in use. Capital in use is the owner's equity plus loans, less the cash held. Enter your **cost of capital** (the return your money must beat); the screen then says whether the business creates value (return above cost) or destroys it (return below). If no capital is in use, no return is shown.

Limits, stated plainly: the return uses the current balance sheet against the chosen months' profit, so a fast-changing balance sheet will move it. The cost of capital is your figure, not one calculated for you.

### Interest rate rises: variable-rate loans (Loans and Scenario plan)

Mark a loan as **variable** on the Loans page when its rate can change. The Scenario plan then shows, for each variable loan, the balance still owed and the monthly repayment now, and what a rise of 1, 2 or 3 points would add per month and per year. The balance is worked out from the loan's own schedule: its amount, rate, term and the months already paid. Fixed-rate loans are not stressed, since a rate rise cannot change them.

Limits, stated plainly: the figures assume the loan's rate is the only thing that changes, and that repayments are otherwise as scheduled. Early repayments you have not recorded as payments are not in the balance, so check the balance against your lender's statement.

### Sustainability and community (Operations page)

Record what you measure, by month: electricity (kWh), water (m³), fuel (litres), waste sent to landfill and waste recycled (kg), emissions as CO₂e (kg, from your supplier or meter), local spend, donations, and staff volunteer hours. The screen shows this month's totals, the recycling rate, and a twelve-month table. Set a target for any measure: a ceiling for energy, water, fuel, waste and emissions; an amount to reach for recycling, local spend, donations and volunteering.

Limits, stated plainly: the app records the figures you enter and does not estimate emissions from fuel or energy use. Emission factors and any certification are for you and your advisers.

### Write-downs (Fixed assets)

When an asset is worth less than its book value, record a **write-down** on its card: the day, the amount lost, and why. It is charged in the month it is dated, as a non-cash expense, and reduces the asset's value from that day. A write-down cannot be dated before the purchase, after today, or be more than the asset is still worth that day.

### Solvency and value (Profit split screen)

Liquidity asks whether you can pay bills now; solvency asks whether you own more than you owe. The screen shows the equity ratio (the share of assets owned), debt to equity, interest cover (profit before interest over interest), and a book value of the capital in use. The book value is equity plus loans, less cash. It is a figure from the books, not a sale price.

### Recurring revenue share (Profit split screen)

The profit split now shows how much of the revenue repeats: sales raised by a recurring schedule (a retainer or repeat billing) against all revenue in the chosen months. Enter a target, for example 65 to 75%, and the screen says whether you are on it. A month with no revenue shows no share.

Limits, stated plainly: only sales raised from a recurring schedule count as recurring; a repeat customer billed by hand does not, so set up a schedule for work that repeats. The share is before tax.

### Partner revenue (Operations page, Partner revenue, owner and manager)

Each partner in the business log (a distributor, reseller, agent or other channel partner) can be credited with the revenue from the customers they referred. When you add or change a customer, name the partner who referred them in the **referred by** field. The screen then shows, for the months you choose, each partner's referred customers, the revenue they brought in, and their share of total revenue. Revenue not from any partner is shown separately.

Limits, stated plainly: a customer counts for a partner only when the referrer name matches the partner's name, ignoring capitals and extra spaces. A different spelling is not matched, so keep the names the same. The figure is revenue, not profit, and no commission is calculated or paid by the app.

### Cost behaviour and value at an earnings multiple (Profit split screen)

**Cost behaviour.** Each expense category has a behaviour. Fixed costs stay the same whatever you sell (payroll, software, insurance, professional fees). Variable costs move with sales (transport and logistics, bank and payment fees). Semi-variable costs have a base plus a part that moves (rent and utilities, marketing, sales pay with commission, other overhead). The screen shows the split for the chosen months. A monthly recurring cost counts in every month from its start.

**Value at an earnings multiple.** Trailing EBITDA is profit before tax, with interest and depreciation added back. Enter a multiple (for example 5 times) and the screen shows the value of the business, and the owners' share after loans, plus cash.

Limits, stated plainly: the behaviour of each category is the app's default, not a measurement of your costs; a cost you know moves differently should be recorded under a category that fits it. The value is an estimate from your chosen multiple, not a valuation by a professional, a quote, or an offer.

### Per-share figures (Profit split screen)

If the business has shareholders, enter the **shares in issue** (or the fully diluted count, which includes options and convertible instruments, if you want those counted). The screen then shows earnings per share (trailing profit after tax divided by the shares) and, once a valuation multiple is set, the value per share and the price-to-earnings ratio that the valuation implies.

Limits, stated plainly: there is no share price in the app, because a private business has no exchange price; the per-share figures are book and estimate figures from the valuation you set. Keep the share count current, since every per-share figure depends on it.

### Customer profit, and the cash waterfall to the partners

**Customer profit (Operations, owner and manager).** For each customer: their revenue, less the cost of what they bought, less refunds on returns, less discounts. Customers are listed worst first and flagged: loses money (no profit left), returns a lot (15% or more of revenue refunded), thin margin (under 5%), or healthy. Refusing or repricing a customer who loses money can be worth more than another sale. The app measures money only, not the time a customer takes.

**Cash waterfall (Profit split screen).** From EBITDA: less interest and tax; less the loan principal repaid in the months chosen (from each loan's schedule); less reinvestment recorded; less the owners' take-home recorded. What remains is shared between the partners you name, for example `Asha:60, Ben:40`. If commitments and take-home exceed what was earned, the screen says so and nothing is shared.

**The assistant's context.** The assistant sees each item's usual price, whether it is an offer or bundle, and its reorder level, when recorded. It does not see live stock levels, which are worked out from purchases and sales on the Products page.

Limits, stated plainly: customer profit uses the product cost the app holds; a customer whose costs are high for reasons not recorded as sales or refunds will look healthier than they are. Principal repaid assumes payments on the loan's schedule; check it against the lender's statement.

### Connecting to AutoLeads (sales engine)

AutoLeads runs the outreach, replies and deal pipeline. Balancr keeps the money. The two stay in step through a lead API key you copy from **Integrations** into AutoLeads. Once a day AutoLeads pulls new inbound leads, moves each deal to match its Balancr lead (Balancr decides won and lost; AutoLeads decides the outreach stages), and reads the status of invoices sent to Balancr (paid, overdue or open). Balancr never creates a customer or a sale from a won lead on its own. The full rules are in SYNC.md.

Limits, stated plainly: the sync runs once a day, so a change made in one app appears in the other the next day. It covers the lead stages and invoice status only; costs, stock, prices and payments are not copied to AutoLeads.

### System check (Operations page, owner only)

The System check shows how much of the database this session has been sent: the number of live listeners, the documents delivered since the tab opened, how many deliveries there were, how long the first data took to arrive, and which collections carry the most. Use it on a real account to see what a month of data costs to load. **Start a fresh count** clears these figures for this tab only.

Limits, stated plainly: documents delivered are a close proxy for database reads, not your billing figure; check the database console for the official count. The figures cover this browser tab only and reset when it is reloaded.

### When the data needs windowing (System check)

Each business's data is loaded whole, which is right while it is small. The System check shows **Windowing is due** only when a session has received 5,000 documents, or one collection alone holds 2,000. Below those figures, nothing is shown. The message names what is large. When it appears, older records should be loaded on request; the people who look after the system should be told.

Limits, stated plainly: the thresholds are set high on purpose and are not a performance test. The check counts documents delivered in this browser tab, so run it over a normal working session.

### Routine customer messages, and the review ask (Settings)

Turn on **Send customers routine messages** in Settings to have Balancr send, with no effort from you: a booking confirmation within the hour a booking is made, a reminder the day before, a follow-up on a quote not answered after three days, a thank-you the day after a job, and a welcome after a customer's first order. Messages go by email when the customer has an email address, and by text (within your quiet hours) when they have a Sri Lankan mobile number. Each event is sent once, and at most 100 messages go out in a run.

Turn on **Ask happy customers for a review** to ask for a review three to five days after a job, only from customers who have agreed to marketing. It is off unless you turn it on.

A customer who asks not to be messaged is marked on their record ("asked not to be messaged"). They then get none of these messages, except the confirmation and reminder for a booking they made themselves.

Limits, stated plainly: the messages are only as good as the records behind them (the booking date and time, the quote's sent date, the project's completed date, and the customer's contact). Times are read on the server's clock, so a reminder can be an hour or so off for a business far from it. Texts depend on the Notify.lk connection and on your SMS settings. The app sends what the rules say; it does not answer replies.

### Sidebar order

The sidebar and the finder show the screens you use every day first. Within Buy & sell, selling and keeping customers come before buying and stocking; within Money, money in and money out come before reporting; within Team, the rota and the time come first.

### Opportunity scoring (Overview) and the leads pipeline (Buy & sell)

**Opportunity scoring** is a planning screen, not a sales pipeline. It scores each business idea you are weighing on its upside, how many future options it keeps open, how long it stays viable, the capital it needs before it pays back, the time to profit, and the travel or relocation friction it carries, then ranks them. It sits under Overview.

**Leads** is the sales pipeline: people who have come in, moved through the stages from new to won or lost. Leads sent from AutoLeads appear here, and their stage follows the sync (see SYNC.md).

### Return on equity and return on capital employed (Profit split screen)

**Return on equity (ROE)** is the profit after tax over the owners' equity: what the owners' own money earns. **Return on capital employed (ROCE)** is the operating profit (before tax and interest) over total assets less current liabilities: what all the capital in the business earns.

The balance sheet doesn't mark each liability as current or long-term, so loans are treated as long-term and everything else as current. If you keep a long-term liability in another form, the ROCE will be a little high. Neither figure is shown when there is no positive equity or capital employed.

### Warning signs and more ratios (Profit split screen)

**Warning signs.** Each sign from the accounting guides is checked against your figures and shown as a flag, OK, or not measured: debt above twice the equity; a current ratio below 1.0; receivables taking more than 60 days to collect; revenue down more than 10% over the last three months against the three before; net margin down more than 2 points; operating costs growing faster than revenue; a loss in the last three months; profit swinging widely from month to month; and, from six months of figures, the trend checks.

**More ratios.** The proprietary ratio, receivables turnover and average collection period, the P/V ratio, the operating ratio, margin on selling price, and markup on cost, each as the accounting sheets give them.

Limits, stated plainly: the turnover ratios use the balances at the period end, not an average of the opening and closing balances, because the app does not keep a running history of every balance. Signs the app cannot measure are shown as not measured: intangible assets, non-operating income, a trend in payables, and a negative operating cash flow (read that on the Cash flow screen). The thresholds are the usual rules of thumb, not advice for your business.

### Open connections: keys to enter (Integrations)

Four more services now have a place on the Integrations page, where you paste the key from the provider you choose: **e-signature** (signing contracts and quotes), **review replies** (drafting and posting replies to reviews), **market prices** (a price source shown beside your own prices), and **distance routing** (ordering delivery stops by distance, once each address is located).

Entering a key stores it privately, shows it back masked, and marks the service as set up. It does not, by itself, make anything happen. Each service's feature starts working when its provider is chosen and its code path is switched on. Nothing is sent or changed automatically: review replies are approved by you first, and a market price never changes a price.

### Accounting terms, and how the app handles them (Operations page, Trial balance)

- **Asset, liability, equity** (the accounting equation): the balance sheet shows them, and the trial balance lists each in its debit or credit column.
- **Revenue, expense, profit, loss:** the monthly income statement, with net profit and loss per month.
- **Capital and drawings:** owner's capital, reinvestment and withdrawals (the capital entries), and owner take-home on the profit split.
- **Trial balance:** a list of every balance, debits against credits, with a check that it reconciles to the balance sheet. It is the post-closing version: the income and cost accounts are already closed into retained earnings.
- **Accrued expense and adjusting entries:** recorded through accruals (costs incurred but not yet billed, reversed the next month), and depreciation.
- **Closing entries:** done each month when the income statement is closed into retained earnings.
- **Prepaid expense:** payments made ahead of use are not yet split out as a prepaid asset.

Not built, stated plainly: the app does not keep a double-entry journal. Each sale, purchase, expense and payment is recorded once, and the statements are built from those records. A full double-entry journal, where every transaction is posted as a debit and a matching credit, is a change to the ledger itself and is not in this release. The trial balance and checks show the books agree, but they are not a double-entry ledger.

### The double-entry journal (Operations page, Journal, owner and manager)

The journal shows each sale, paid or unpaid expense and capital entry as a double entry: money coming in is a debit and the matching credit shows where it came from, and money going out is the reverse. Every entry is shown only when its debits equal its credits. Credit sales debit accounts receivable, cash sales debit cash, sales tax is kept in its own account, and an outside investor's money returned to them is kept apart from owners' capital.

Limits, stated plainly: the journal is built from your records; it does not change them, and nothing is posted to a stored ledger. It covers sales, cost of sales, payments on account, stock purchases with their landed costs and tax, expenses, capital entries, loans drawn and repaid (each repayment split into interest and principal), and fixed assets (cost and monthly depreciation). Not yet mapped: disposals of fixed assets, sales and purchase returns, customer deposits and supplier credit, and prepaid expenses.

The reconciliation at the top compares the journal's balances with the balance sheet, line by line. A line that reconciles is marked so. A line with a difference is shown with the amount, rather than hidden: a difference usually points to something not yet mapped, or a figure to check against your records.

### Sync log and fixed-asset disposals

**Sync log.** Every time AutoLeads changes a lead's stage in Balancr, or reads an invoice's status, the call is recorded with what it did, the record it touched, and whether it succeeded. A log that cannot be written never stops the sync itself. Note that reading an invoice status now writes one log entry.

**Disposals in the journal.** Selling or writing off a fixed asset records the cash received, clears its accumulated depreciation, removes its cost, and books the difference as a gain or a loss. A write-off with nothing received is a loss equal to the asset's book value.

### Contractor and talent shares (Operations page, owner and manager)

If a product or service is delivered by a contractor or a talent who earns a share of its sales, enter their name and their share (0 to 100%) on the product. The Contractor and talent shares screen then shows, for the months you choose, what each contractor earned: their share of the revenue (before tax) from their products, and the total owed to contractors, with any revenue that has no contractor shown separately.

Limits, stated plainly: returns are not yet taken off these figures; the amounts are not yet deducted from profit or posted to the journal; you pay them from the list and record the payment as an expense. A product whose share is outside 0 to 100% is reported and left unassigned.

### Year-end close (Operations page, owner only)

Closing a year locks every dated record in it against change, through 31 December, using the same lock as the monthly close. It can only run when: the months before December are already closed; the balance sheet and the trial balance both balance; you have checked the Journal screen and every reconciliation line agrees (or each difference is explained); and you confirm the close yourself. A year can only be moved forward, never reopened by closing it. Reopening is done from Settings and is logged.

Limits, stated plainly: the journal check is a confirmation you make, because the app does not re-run the full journal on this screen. Closing a year is not a tax filing; it does not file anything with a tax authority.

### Part deliveries (Delivery run)

An order can now be delivered in parts. Under each order on the delivery run, every product shows how many are still to go, and a box to record how many are delivered now. A delivery can't be more than what is left, and a zero or a date that does not exist is refused. The order is dated as delivered only when every product is complete, on the day the last one arrives. "Delivered today" still completes the whole order at once.

Limits, stated plainly: invoices still bill the whole order, not only the part delivered. Invoicing per delivery is not built yet. Stock and the order's delivered value are worked out from what was delivered; the invoice is not.

### Invoicing per delivery (Web orders and Delivery run)

When you confirm a web order, you can tick **Record each part as it is delivered**. Then no sale is recorded at confirmation. Each time you record a part delivery on the delivery run, Balancr records a sale for exactly what that delivery added, with its own invoice number (the order number, then -D1, -D2 and so on). The goods leave stock on the day they are delivered, and each delivery is billed once. "Delivered today" bills everything on the order that has not yet been billed.

Orders confirmed without the tick keep today's behaviour: all sales are recorded at confirmation. A product on an order with no product link cannot be billed or move stock, so the delivery is stopped and the line is named.

Limits, stated plainly: the sale is dated the day of the delivery, not the day the order was placed. Returns of a delivered part are handled through the usual returns, not through the order. Customer payment is recorded against each invoice in the usual way.

### Deleting a product (Products)

A product with sales or purchases on record can't be deleted. Balancr refuses, and tells you how many sales and purchases it has. Archive it instead (set it to inactive): its history stays intact, and it stops appearing for new sales. Deleting a product with no history still works. This stops stock and sales from being left pointing at a product that no longer exists.

### Deleting a whole business (platform admin only)

The platform admin can delete a business and all its data from the admin list: click **Delete** beside it, then type the business ID exactly. There is no undo. It is for test accounts and for a business that has asked to be removed. Nothing else is deleted: other businesses are untouched. A business's people may still be able to sign in until they are removed from the list; check the admin list after the delete.

### Weekly numbers (Settings)

Turn on **Email me my week every Monday** and enter an address. Each Monday you get the previous week (Monday to Sunday): the sales, the expenses, and what is left between them. It is a quick read of the week, not the accounting profit; the full profit and balance sheet are in Balancr.

Limits, stated plainly: it uses the sales and expenses dated in that week, and nothing else. It is sent only when email is configured for the app.

### Second signer on supplier payments (Settings, Requests)

Set **Supplier payments above this need a second signer** in Settings. From then on, a supplier payment above that amount is not posted straight away: it goes to the Requests list as a supplier payment, waiting for approval. Another owner, or a manager within their approval limit, approves it, and the payment is recorded then, with the approver's name kept on it. The person who recorded the payment cannot approve it. Leave the field blank to switch the control off.

Limits, stated plainly: the rule covers supplier payments and bill payments (paying a bill recorded on the Expenses page). An expense recorded as already paid at entry is not a payment to approve, so it is not routed through it. Until a payment is approved, the balance still shows it as owed.

### Payments reach AutoLeads as they happen

When you record a payment against an invoice, Balancr tells AutoLeads the invoice's new status straight away (paid, or overdue), so AutoLeads stops chasing it without waiting for the next daily check. This uses the webhook address set in the automations (Integrations). A payment recorded by a staff login is not sent this way; the daily sync picks it up. Lead stage changes already go across as they happen. The daily sync remains the backstop for everything.

### Price history (Price & condition page)

**Price history.** Every change to a product's sell, cost or wholesale price, including the starting prices of products added by an import, is recorded on the price-control page, under Recent price changes: the day, the product, the price, the old and new value, the percentage it moved, and who made the change. A price set for the first time, or cleared, is recorded too. The record is written in the same save as the change, and nothing can be edited or removed from it. It shows the latest 25 changes; the newest 200 are kept.

Limits, stated plainly: the history records the change and changes no price, cost, sale or stock.

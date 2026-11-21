// Deliberately short (one or two sentences) and free of further jargon —
// the point is to unblock someone reading a statement, not to teach a full
// accounting course inline. Bounded, static list; add terms here as they
// come up rather than building a general help system.
export const GLOSSARY: Record<string, string> = {
  cogs:
    "Cost of Goods Sold — what it actually cost you to buy or make the things you sold this period. Revenue minus COGS is your gross profit.",
  "gross margin":
    "What's left from a sale after subtracting what it cost you to buy or make (COGS), shown as a % of the sale price. Higher means more room to cover your other bills.",
  "gross profit": "Revenue minus COGS — what you made before rent, salaries, and other running costs.",
  "net profit":
    "What's left after every cost is subtracted from revenue — COGS, running costs, interest, everything. This is the real bottom line.",
  "net margin": "Net profit shown as a % of revenue — how many cents of every sale you actually keep after every cost.",
  "operating margin":
    "Profit after COGS and day-to-day running costs, but before interest and tax, shown as a % of revenue — how efficiently the core business runs.",
  "contribution margin":
    "What one more sale adds to covering your fixed costs — the sale price minus the costs that scale directly with it (materials, delivery, commission). Doesn't include rent or salaries, which don't change with one extra sale.",
  "break-even point":
    "The sales level where your contribution margin exactly covers your fixed costs (rent, salaries, etc.) — below it you're losing money, above it every extra sale is profit.",
  "accrual basis":
    "Counting a sale or a bill the moment it happens, whether or not cash has actually changed hands yet. This is what the Income Statement and Profit page use — it shows whether the business itself is profitable, separate from cash timing.",
  "cash basis":
    "Counting money only when it actually moves — cash in, cash out. This is what the Cash Flow page tracks, since a profitable business can still run out of cash if payments are slow to arrive.",
  "accounts receivable":
    "Money customers owe you for sales already made — you've delivered, they haven't paid yet.",
  "accounts payable": "Money you owe suppliers or others for things already received — you haven't paid yet.",
  "fixed costs":
    "Costs that stay roughly the same regardless of how much you sell — rent, salaries, insurance.",
  "variable costs": "Costs that rise and fall directly with how much you sell — materials, delivery, commission.",
  "operating expenses":
    "The day-to-day cost of running the business that isn't tied to a specific sale — rent, salaries, subscriptions, insurance. Separate from COGS, which is what it cost to buy or make what you sold.",
  runway: "How many months your current cash would last if income stopped and outgoings stayed the same.",
  eoq:
    "Economic Order Quantity — the order size that minimizes your total cost of ordering plus holding stock, based on how fast an item sells.",
  "average order value":
    "Total sales revenue divided by number of orders — how much a customer typically spends in one purchase. Going up usually means upsells, bundles, or fewer small orders.",
  "average selling price":
    "Total revenue divided by units sold — what you're actually collecting per item on average. Falling usually means discounting or a shift toward cheaper items, even if prices on paper haven't changed.",
  "days payable outstanding":
    "The average number of days it takes you to pay your suppliers after receiving a bill. Higher means you're holding onto cash longer; too high can strain supplier relationships.",
  "net present value":
    "Today's value of a future stream of cash, after discounting it for the fact that money now is worth more than the same money later. Positive means the investment is expected to add value.",
  "internal rate of return":
    "The growth rate at which an investment breaks even in present-value terms — in plain terms, the effective annual return it's expected to earn. Compare it to what you could earn elsewhere with the same money.",
  "payback period": "How long it takes for an investment to earn back what it cost, before accounting for the time-value of money.",
  "working capital":
    "What you own that turns into cash soon (cash, money customers owe you, stock) minus what you owe soon (supplier bills, loan payments due within a year). Positive means you can cover near-term bills; negative means you're relying on future sales or new funding to do it.",
  ebit:
    "Earnings Before Interest and Tax — what the business itself earned from operating, before loan interest and income tax. It lets you judge the operation separately from how it's financed.",
  "asset turnover":
    "How many times a year your sales \"turn over\" the total value of what the business owns. Higher means your assets (cash, stock, equipment) are working hard; low means a lot is tied up relative to what it sells.",
  "economic profit":
    "What's left after you also subtract a fair salary for the work you personally put in — a more honest number than \"net profit\" for an owner who doesn't pay themselves a market-rate wage.",
  "sg&a":
    "Selling, general and administrative costs: the running costs that are not making the product. Marketing, sales staff, delivery, admin salaries, office costs. Shown as a % of revenue.",
  "r&d":
    "Research and development: spending on creating or improving products. Balancr counts an expense as R&D when its category says R&D, research or development.",
  "ebitda":
    "Earnings before interest, tax, depreciation and amortisation: operating profit with the non-cash wear of assets added back. Lenders and buyers use it to compare businesses.",
  "enterprise value":
    "What the operations are worth before the owners' share: earnings multiplied by a market multiple. Equity value is what is left for the owners after debt and cash.",
  "equity value":
    "What the owners hold: enterprise value, less the loans owed, plus the cash in the bank.",
  "net asset value":
    "Assets minus liabilities on the balance sheet: what the business would be worth if it sold everything and paid every debt. Often low for service businesses, whose value is in people and customers.",
  "dcf":
    "Discounted cash flow: the value today of the cash the business is expected to produce in future years, each year's cash discounted back at your required return.",
  "ebitda multiple":
    "A quick valuation: EBITDA multiplied by the multiple similar businesses sell for.",
  "revenue multiple":
    "A quick valuation for early or low-profit businesses: revenue multiplied by the multiple similar businesses sell for.",
  "direct cost":
    "A cost you can trace to one product or service, such as raw materials or the wages of the people making it.",
  "indirect cost":
    "A cost you cannot trace to one product, such as rent, utilities or a manager's salary.",
  "operating cost":
    "A cost of running the business day to day (rent, wages, utilities, depreciation), as opposed to financing or one-off items.",
  "non-operating cost":
    "A cost outside the core business, such as interest on loans, or a loss on selling an asset.",
  "controllable cost":
    "A cost a manager can change in the short term, such as travel or advertising.",
  "uncontrollable cost":
    "A cost a manager cannot change in the short term, such as a head-office charge or a lease.",
  "opportunity cost":
    "What you give up by choosing one option: the best alternative you did not take, such as renting out a building instead of using it yourself.",
  "sunk cost":
    "Money already spent and gone for good. It should not decide future choices.",
  "marginal cost":
    "The extra cost of making one more unit: the extra materials and labour for one more.",
  "standard cost":
    "A planned cost per unit, set in advance, to compare against what actually happened.",
  "actual cost":
    "What was really spent on production or a service, from the invoices and pay records.",
  "product cost":
    "The costs of making a product, including its stock until it sells: direct materials, direct labour and manufacturing overhead.",
  "period cost":
    "Costs expensed in the period they arise and not tied to making products, such as admin salaries, office rent and marketing.",
  "semi-variable cost":
    "A cost with a fixed part and a part that moves with activity, such as an electricity bill or a commission on a fixed base.",
  "capex":
    "Capital expenditure: money spent on long-lived assets such as equipment, vehicles or property. It is not an expense when bought; it comes back through depreciation over time.",
  "depreciation":
    "The yearly write-down of an asset's cost over its useful life. A non-cash expense.",
  "wacc":
    "Weighted average cost of capital: the blended return the business must earn, weighting the cost of loans and the owners' required return by how much of each it uses.",
  "return on capital employed":
    "Operating profit divided by capital employed (total assets less current liabilities). Shows how well the capital in the business is used, before tax and interest.",
  "capitalised development cost":
    "Development spending that an accounting standard lets you record as an asset and spread over its useful life, instead of an expense in the year. Only when the criteria are met; your accountant decides.",
  "contingent liability":
    "A possible obligation that depends on a future event outside the business's control, such as a lawsuit. It is disclosed in the notes, and booked only when a payment becomes likely and can be measured.",
  "short-term liability":
    "An obligation due within twelve months, such as a supplier bill or a bank overdraft. The same as a current liability.",
  "current liability":
    "An obligation due within the next year. The same as a short-term liability.",
  "long-term liability":
    "An obligation due after more than a year, such as a long bank loan. The same as a non-current liability.",
  "non-current liability":
    "An obligation due after more than a year. The same as a long-term liability.",
  "systematic risk":
    "Risk from the whole market or economy, such as interest rates or inflation. The business cannot control it, and spreading investments across companies does not remove it.",
  "unsystematic risk":
    "Risk specific to one business or industry, such as losing a key customer or a fraud. The business can control or insure it, and spreading investments removes much of it.",
  "interest rate risk":
    "The risk that changes in interest rates change the value of bonds (price risk), or the return on cash reinvested at maturity (reinvestment rate risk).",
  "net worth":
    "What the owners would be left with if every asset were sold at book value and every debt paid. On the balance sheet it is total equity: total assets minus total liabilities.",
  "purchasing power":
    "How much goods money can buy. Rising prices (inflation) lower it over time, so cash held without a return loses value. At 5% inflation a year, cash loses about 5% of its buying power each year.",
  "purchasing power risk":
    "The risk that inflation reduces what money can buy. It shows up as demand inflation risk or cost inflation risk.",
  "quantitative tightening":
    "The central bank selling bonds, or letting them mature, to take money out of the economy. Bond prices fall, yields rise, borrowing gets dearer, spending slows, and inflation falls.",
  "capital work-in-progress":
    "Money spent on an asset that is not yet ready for use. It is held as an asset until the asset is ready, then moved into fixed assets (CWIP).",
  "TIN":
    "Taxpayer identification number: the nine-digit number issued by the Inland Revenue. Tax invoices show the seller's TIN, and the buyer's TIN when the buyer is VAT-registered.",
  "date of supply":
    "The day the goods or services were supplied. A tax invoice shows it alongside the date of the invoice. It is the sale date unless a different supply date is entered.",
  "tax invoice":
    "The invoice a VAT-registered business issues to its customers. It needs the seller's TIN, the buyer's TIN, a serial number in the set format (YYMMM_QQQQ_XXXXX), both dates, and the value excluding VAT, the VAT and the total.",
};

export type GlossaryKey = keyof typeof GLOSSARY;

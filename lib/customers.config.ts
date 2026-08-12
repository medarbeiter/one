/**
 * Erzeugt von `bun run customers`, danach von Hand korrigiert.
 * Meta kennt keinen Kundenbegriff; diese Zuordnung weiß nur die Agentur.
 */
export type CustomerConfig = {
  id: string;
  name: string;
  pageId: string;
  igId?: string;
  adAccountIds: string[];
};

export const customers: CustomerConfig[] = [
  {
    "id": "herzhalt",
    "name": "Herzhalt Pflegedienst",
    "pageId": "1189746767562744",
    "adAccountIds": []
  },
  {
    "id": "weber",
    "name": "Pflegedienst Weber",
    "pageId": "1305202512668577",
    "adAccountIds": []
  },
  {
    "id": "pflegewohnzentrumkaulsdo",
    "name": "Pflegewohnzentrum Kaulsdorf-Nord",
    "pageId": "1228161393718853",
    "adAccountIds": []
  },
  {
    "id": "neubapflegeundbetreuungs",
    "name": "NeuBa Pflege- und Betreuungsdienst",
    "pageId": "1242865122245382",
    "adAccountIds": []
  },
  {
    "id": "palliativo",
    "name": "Palliativo",
    "pageId": "1174790339058824",
    "adAccountIds": []
  },
  {
    "id": "cnderchristophstrobelund",
    "name": "CN-Der Pflegedienst Christoph Strobel und Nikola Banicevic",
    "pageId": "1317890778065360",
    "adAccountIds": []
  },
  {
    "id": "evangelischesdiakoniewer",
    "name": "Evangelisches Diakoniewerk Bethanien Ducherow",
    "pageId": "1162211200319036",
    "adAccountIds": []
  },
  {
    "id": "agnes",
    "name": "Pflegedienst Agnes GmbH",
    "pageId": "1251905711337792",
    "adAccountIds": []
  },
  {
    "id": "schkel",
    "name": "Pflegedienst Schäkel",
    "pageId": "1270281076173809",
    "adAccountIds": []
  },
  {
    "id": "pflegebrofrohsinn",
    "name": "Pflegebüro Frohsinn",
    "pageId": "1292538323938584",
    "adAccountIds": []
  },
  {
    "id": "gemeinschaftshospizchris",
    "name": "Gemeinschaftshospiz Christophorus",
    "pageId": "1172118259326047",
    "adAccountIds": []
  },
  {
    "id": "belvitakrankenundaltenpf",
    "name": "Belvita Pflegedienst Kranken- und Altenpflege KG",
    "pageId": "1279150771938170",
    "adAccountIds": []
  },
  {
    "id": "nossen",
    "name": "Pflegedienst Nossen",
    "pageId": "1257646847425288",
    "adAccountIds": []
  },
  {
    "id": "binder",
    "name": "BinDer Ambulanter Pflegedienst",
    "pageId": "1291873887332390",
    "adAccountIds": []
  },
  {
    "id": "dasemmendingen",
    "name": "Das PflegeTeam Emmendingen",
    "pageId": "1140566789146824",
    "adAccountIds": []
  },
  {
    "id": "bedrichaltenundkrankenpf",
    "name": "Pflegedienst Bedrich Ambulante Alten- und Krankenpflege",
    "pageId": "1259439460575381",
    "adAccountIds": []
  },
  {
    "id": "urologischegemeinschafts",
    "name": "Urologische Gemeinschaftspraxis Dipl.- Med. J Tolkmitt",
    "pageId": "1163046310224880",
    "adAccountIds": []
  },
  {
    "id": "glashtten",
    "name": "Seniorenheim Glashütten",
    "pageId": "1119137221286011",
    "adAccountIds": []
  },
  {
    "id": "pflegeleichtluckau",
    "name": "Pflegeleicht Luckau GmbH",
    "pageId": "1158946053965313",
    "adAccountIds": []
  },
  {
    "id": "merzenich",
    "name": "Ambulanter Pflegedienst Merzenich",
    "pageId": "1190339330823924",
    "adAccountIds": []
  },
  {
    "id": "mandylattermannpflegemit",
    "name": "Mandy Lattermann - Pflege mit Herz ",
    "pageId": "1197146103471636",
    "adAccountIds": []
  },
  {
    "id": "avaloncare",
    "name": "Avalon Care GmbH",
    "pageId": "1209967765523657",
    "adAccountIds": []
  },
  {
    "id": "birkenhofsozialedienste",
    "name": "Birkenhof Soziale Dienste GmbH",
    "pageId": "1084814521382986",
    "adAccountIds": []
  },
  {
    "id": "krankenundaltenpflegerhe",
    "name": "Ambulante Kranken- und Altenpflege Rhein - Ruhr GbR",
    "pageId": "1161746097013046",
    "adAccountIds": []
  },
  {
    "id": "janines",
    "name": "Janine's Pflegeteam",
    "pageId": "1066791689857037",
    "adAccountIds": []
  },
  {
    "id": "aspflegeintensiv",
    "name": "A&S Pflege - Intensiv",
    "pageId": "1006096775930317",
    "adAccountIds": []
  },
  {
    "id": "altenpflegediensthansen",
    "name": "Altenpflegedienst Hansen",
    "pageId": "1096221826903713",
    "adAccountIds": []
  },
  {
    "id": "sozietthauchpartner",
    "name": "Sozietät Hauch-Partner",
    "pageId": "1042388502296130",
    "adAccountIds": []
  },
  {
    "id": "sonnenscheinzuhause",
    "name": "Sonnenschein zu Hause",
    "pageId": "1086739221185073",
    "adAccountIds": []
  },
  {
    "id": "sozialstationkrumbach",
    "name": "Sozialstation Krumbach",
    "pageId": "1012192915314507",
    "adAccountIds": []
  },
  {
    "id": "seniorenundpflegeheimede",
    "name": "Senioren- und Pflegeheime des Landkreises Ostallgäu",
    "pageId": "1004619202738720",
    "adAccountIds": []
  },
  {
    "id": "unicus",
    "name": "Unicus GmbH Ambulanter Pflegedienst",
    "pageId": "1122206697632715",
    "adAccountIds": []
  },
  {
    "id": "therapiezentrummnnel",
    "name": "Therapiezentrum Männel",
    "pageId": "1041807912340447",
    "adAccountIds": []
  },
  {
    "id": "aiutandarheinruhr",
    "name": "Aiutanda Rhein Ruhr",
    "pageId": "975418192329273",
    "adAccountIds": []
  },
  {
    "id": "grabowskibevensen",
    "name": "Grabowski Bevensen GmbH",
    "pageId": "1037894746071349",
    "adAccountIds": []
  },
  {
    "id": "altenundpflegeheimwillig",
    "name": "Alten- und Pflegeheim Willig OHG",
    "pageId": "969686733138982",
    "adAccountIds": []
  },
  {
    "id": "connyridder",
    "name": "Pflegeteam Conny Ridder",
    "pageId": "880813725123036",
    "adAccountIds": []
  },
  {
    "id": "regenbogenchristabernhar",
    "name": "Pflegedienst Regenbogen Christa Bernhart & Stefan Blumenfeld GbR",
    "pageId": "978547232001895",
    "adAccountIds": []
  },
  {
    "id": "altenundpflegeheimmariaf",
    "name": "Alten- und Pflegeheim Maria Frieden",
    "pageId": "858975980641280",
    "adAccountIds": []
  },
  {
    "id": "huslichepflegesanitas",
    "name": "Häusliche Pflege Sanitas GmbH",
    "pageId": "961065323747297",
    "adAccountIds": []
  },
  {
    "id": "beispielseitexyz",
    "name": "Beispielseite XYZ",
    "pageId": "900747399790103",
    "adAccountIds": []
  },
  {
    "id": "sozialstationstelisabeth",
    "name": "Sozialstation St. Elisabeth",
    "pageId": "907530432436308",
    "adAccountIds": []
  },
  {
    "id": "mevita",
    "name": "MeVita Pflegedienst GmbH",
    "pageId": "886781941184526",
    "adAccountIds": []
  },
  {
    "id": "medicalhomeberlin",
    "name": "Medical Home Berlin Pflegedienst GmbH",
    "pageId": "896527870207721",
    "adAccountIds": []
  },
  {
    "id": "bekraco",
    "name": "Bekra GmbH & Co. KG",
    "pageId": "904175949439700",
    "adAccountIds": []
  },
  {
    "id": "kbssabinemarx",
    "name": "KBS Pflegeteam Sabine Marx",
    "pageId": "811506468716495",
    "adAccountIds": []
  },
  {
    "id": "kbssabinemarxgmbh",
    "name": "KBS Pflegeteam Sabine Marx GmbH",
    "pageId": "875948942260994",
    "adAccountIds": []
  },
  {
    "id": "pflegendehnde",
    "name": "Ambulanter Pflegedienst \"Pflegende Hände\"",
    "pageId": "805447135985935",
    "adAccountIds": []
  },
  {
    "id": "dialogmedicare",
    "name": "Dialog Medicare GmbH",
    "pageId": "840548642464464",
    "adAccountIds": []
  },
  {
    "id": "pflegeheimlucka",
    "name": "Pflegeheim Lucka",
    "pageId": "712682571937708",
    "adAccountIds": []
  },
  {
    "id": "ukdservice",
    "name": "UKD Service",
    "pageId": "697966996743780",
    "adAccountIds": []
  },
  {
    "id": "seniorenzentrumampforten",
    "name": "Seniorenzentrum am Pfortenplatz",
    "pageId": "702503299620719",
    "adAccountIds": []
  },
  {
    "id": "antaramedicalcare",
    "name": "Antara Medical Care GmbH",
    "pageId": "754766457716448",
    "adAccountIds": []
  },
  {
    "id": "intensivpflegelahndill",
    "name": "Intensivpflege Lahn-Dill",
    "pageId": "696149140253873",
    "adAccountIds": []
  },
  {
    "id": "diakoniestationteck",
    "name": "Diakoniestation Teck",
    "pageId": "746753081847644",
    "adAccountIds": []
  },
  {
    "id": "millcura",
    "name": "Millcura Pflegedienst",
    "pageId": "744416592082387",
    "adAccountIds": []
  },
  {
    "id": "pflegeheimdrexler",
    "name": "Pflegeheim Drexler",
    "pageId": "666540556549773",
    "adAccountIds": []
  },
  {
    "id": "sapvfrechen",
    "name": "SAPV Frechen",
    "pageId": "659593197245926",
    "adAccountIds": []
  },
  {
    "id": "gabiskrankenpflege",
    "name": "Gabis Krankenpflege",
    "pageId": "668572513012002",
    "adAccountIds": []
  },
  {
    "id": "dialogmed",
    "name": "Dialog MeD",
    "pageId": "718909681298564",
    "adAccountIds": []
  },
  {
    "id": "allure",
    "name": "Allure Pflegedienst",
    "pageId": "720068444516524",
    "adAccountIds": []
  },
  {
    "id": "pflegeambulantjulia",
    "name": "Pflege ambulant \"Julia\"",
    "pageId": "689752197548502",
    "adAccountIds": []
  },
  {
    "id": "pflegeservicecuratio",
    "name": "Pflegeservice Curatio",
    "pageId": "691994083992200",
    "adAccountIds": []
  },
  {
    "id": "schwann",
    "name": "Seniorenheim Schwann GmbH",
    "pageId": "574184439121158",
    "adAccountIds": []
  },
  {
    "id": "ritawothke",
    "name": "Ambulanter Pflegedienst Rita Wothke",
    "pageId": "570813532791923",
    "adAccountIds": []
  },
  {
    "id": "animacor",
    "name": "AnimaCor Pflegedienst",
    "pageId": "616320734899361",
    "adAccountIds": []
  },
  {
    "id": "leonhardtmllermedicalcar",
    "name": "Leonhardt & Müller Medical Care",
    "pageId": "631194336736253",
    "adAccountIds": []
  },
  {
    "id": "klinikenschweiz",
    "name": "Kliniken Schweiz",
    "pageId": "534883976385069",
    "adAccountIds": []
  },
  {
    "id": "spitalstiftungpattendorf",
    "name": "Spitalstiftung Pattendorf",
    "pageId": "605553709305764",
    "adAccountIds": []
  },
  {
    "id": "zahnarztpraxisdressrgel",
    "name": "Zahnarztpraxis Dres. Sörgel",
    "pageId": "596843610177158",
    "adAccountIds": []
  },
  {
    "id": "schroeter",
    "name": "Pflegedienst Schröter",
    "pageId": "565588823303215",
    "adAccountIds": []
  },
  {
    "id": "diakonievereinburghof",
    "name": "Diakonieverein Burghof e. V.",
    "pageId": "516350871569038",
    "adAccountIds": []
  },
  {
    "id": "hausstefanie",
    "name": "Haus Stefanie",
    "pageId": "603770206145461",
    "adAccountIds": []
  },
  {
    "id": "pflege38",
    "name": "Pflege 38",
    "pageId": "558236114032493",
    "adAccountIds": []
  },
  {
    "id": "dianovienordharz",
    "name": "Dianovie Nordharz",
    "pageId": "555802554277248",
    "adAccountIds": []
  },
  {
    "id": "leaunddasleben",
    "name": "Pflegedienst \"Lea und das Leben\"",
    "pageId": "548313815032008",
    "adAccountIds": []
  },
  {
    "id": "nodiagphysiotherapie",
    "name": "NoDiag - Physiotherapie",
    "pageId": "502633006271897",
    "adAccountIds": []
  },
  {
    "id": "resapflegefeuerwehr",
    "name": "ReSa Pflegefeuerwehr",
    "pageId": "546670265189136",
    "adAccountIds": []
  },
  {
    "id": "diakonielichtenrade",
    "name": "Diakonie Lichtenrade",
    "pageId": "511203102077461",
    "adAccountIds": []
  },
  {
    "id": "mitanderenlebenwgs",
    "name": "Mit Anderen leben - WGs",
    "pageId": "512719205258005",
    "adAccountIds": []
  },
  {
    "id": "hauskblerwohnenpflegefrs",
    "name": "Haus Kübler - Wohnen & Pflege für Senioren",
    "pageId": "486790921192639",
    "adAccountIds": []
  },
  {
    "id": "handinhandbraunschweig",
    "name": "Hand in Hand Pflegedienst Braunschweig",
    "pageId": "511083065422134",
    "adAccountIds": []
  },
  {
    "id": "menschlichjantos",
    "name": "Pflegedienst Menschlich Jantos",
    "pageId": "436640436206840",
    "adAccountIds": []
  },
  {
    "id": "medihelp",
    "name": "Pflegedienst Medi Help",
    "pageId": "461992540332806",
    "adAccountIds": []
  },
  {
    "id": "jobsmedarbeiter",
    "name": "Jobs - MedArbeiter",
    "pageId": "337164132803732",
    "adAccountIds": [
      "act_5475637912552784"
    ]
  },
  {
    "id": "medarbeiter",
    "name": "MedArbeiter",
    "pageId": "111290308722893",
    "adAccountIds": [
      "act_892281195749177",
      "act_5475637912552784"
    ]
  },
  {
    "id": "iakcoaching",
    "name": "IAK Coaching",
    "pageId": "132889529918575",
    "adAccountIds": [
      "act_215635408274003"
    ]
  },
  {
    "id": "onkologiechemnitz",
    "name": "Onkologie Chemnitz",
    "pageId": "102063529660170",
    "adAccountIds": []
  },
  {
    "id": "solutionsengineeringteam",
    "name": "Solutions Engineering Team",
    "pageId": "111136188713745",
    "adAccountIds": []
  },
  {
    "id": "digitalisierungsagenturs",
    "name": "Digitalisierungsagentur Sachsen",
    "pageId": "101515085964203",
    "adAccountIds": []
  },
  {
    "id": "funke",
    "name": "Pflegedienst Funke",
    "pageId": "100241722761621",
    "adAccountIds": [
      "act_355319637606282"
    ]
  },
  {
    "id": "sozialservicerochlitz",
    "name": "Sozialservice Rochlitz",
    "pageId": "100767188047935",
    "adAccountIds": []
  },
  {
    "id": "tobiashausaltenundpflege",
    "name": "Tobias-Haus Alten- und Pflegeheim gGmbH",
    "pageId": "100846098754421",
    "adAccountIds": []
  },
  {
    "id": "diakoniegebesee",
    "name": "Diakonie Gebesee",
    "pageId": "100886942563056",
    "adAccountIds": []
  },
  {
    "id": "liricamper",
    "name": "liricamper",
    "pageId": "101108612558717",
    "adAccountIds": []
  },
  {
    "id": "chadlifeequipment",
    "name": "ChadLife Equipment",
    "pageId": "101780535730375",
    "adAccountIds": []
  },
  {
    "id": "caritasstmichael",
    "name": "Caritas Altenpflegeheim St. Michael Dresden",
    "pageId": "101877271400716",
    "adAccountIds": []
  },
  {
    "id": "krankenpflegediensttina",
    "name": "Ambulanter Krankenpflegedienst Tina",
    "pageId": "102570165258676",
    "adAccountIds": [
      "act_724291609745044"
    ]
  },
  {
    "id": "oberneulander",
    "name": "Oberneulander Pflegedienst",
    "pageId": "102584862879426",
    "adAccountIds": []
  },
  {
    "id": "awoseniorenbetreuungneus",
    "name": "AWO Seniorenbetreuung Neustadt an der Aisch",
    "pageId": "102854848862503",
    "adAccountIds": [
      "act_419270389708077"
    ]
  },
  {
    "id": "anna",
    "name": "Anna Pflegedienst",
    "pageId": "102887768243241",
    "adAccountIds": []
  },
  {
    "id": "gstarstoresberlin",
    "name": "G-Star Stores Berlin",
    "pageId": "103390596392069",
    "adAccountIds": [
      "act_5759366754098459"
    ]
  },
  {
    "id": "pflegeundbetreuungszentr",
    "name": "Pflege-und Betreuungszentrum Burgenblick",
    "pageId": "103723726128343",
    "adAccountIds": []
  },
  {
    "id": "vitalcura",
    "name": "VitalCura GmbH",
    "pageId": "103832179360245",
    "adAccountIds": []
  },
  {
    "id": "drwdierobbenwulfsdorf",
    "name": "DRW Die Robben Wulfsdorf",
    "pageId": "104197395602401",
    "adAccountIds": []
  },
  {
    "id": "asbcoburg",
    "name": "ASB-Coburg",
    "pageId": "104722094229705",
    "adAccountIds": []
  },
  {
    "id": "puracarepflege",
    "name": "Pura Care Ambulante Pflege GmbH",
    "pageId": "105106762446430",
    "adAccountIds": []
  },
  {
    "id": "obhut",
    "name": "Ambulanter Pflegedienst Obhut",
    "pageId": "105296855315804",
    "adAccountIds": []
  },
  {
    "id": "physiotherapieebert",
    "name": "Physiotherapie Ebert",
    "pageId": "105448721442910",
    "adAccountIds": [
      "act_839112341021698"
    ]
  },
  {
    "id": "lavitapflege",
    "name": "La Vita ambulante Pflege GmbH",
    "pageId": "105489018838068",
    "adAccountIds": []
  },
  {
    "id": "pflegemeisterberlin",
    "name": "Pflegemeister-Berlin",
    "pageId": "105951772085247",
    "adAccountIds": []
  },
  {
    "id": "hauskrankenpflegeannette",
    "name": "Hauskrankenpflege Annette Huth",
    "pageId": "105968160822477",
    "adAccountIds": []
  },
  {
    "id": "seniorenhaushandorf",
    "name": "Seniorenhaus Handorf",
    "pageId": "105993250884759",
    "adAccountIds": []
  },
  {
    "id": "chrisana",
    "name": "Chrisana Pflegedienst GmbH",
    "pageId": "106694595304350",
    "adAccountIds": []
  },
  {
    "id": "diakoniesozialstationrot",
    "name": "Diakonie-Sozialstation Rotenburg/Sottrum",
    "pageId": "106877405651291",
    "adAccountIds": [
      "act_458689263505013"
    ]
  },
  {
    "id": "diakoniesozialstationvis",
    "name": "Diakonie-Sozialstation Visselhövede-Bothel",
    "pageId": "107148779068678",
    "adAccountIds": []
  },
  {
    "id": "huslicherkrankenpflegedi",
    "name": "Häuslicher Krankenpflegedienst Meis",
    "pageId": "107241215461449",
    "adAccountIds": []
  },
  {
    "id": "ritter",
    "name": "Pflegedienst Ritter",
    "pageId": "107709501193480",
    "adAccountIds": [
      "act_1007205457677958"
    ]
  },
  {
    "id": "pflegebiene",
    "name": "Pflegebiene",
    "pageId": "107747531177545",
    "adAccountIds": []
  },
  {
    "id": "aozchemnitz",
    "name": "AOZ Chemnitz",
    "pageId": "107988831978373",
    "adAccountIds": []
  },
  {
    "id": "evangelischesozialstatio",
    "name": "Evangelische Sozialstation Mosbach e.V.",
    "pageId": "108108225577846",
    "adAccountIds": []
  },
  {
    "id": "seniorenstiftamobermains",
    "name": "Seniorenstift am Obermain STE GmbH",
    "pageId": "108241785605088",
    "adAccountIds": []
  },
  {
    "id": "vlcarepflege",
    "name": "VölCare GmbH - ambulante Pflege",
    "pageId": "108338531316710",
    "adAccountIds": []
  },
  {
    "id": "pflegedienstleistungenla",
    "name": "Pflege-Dienstleistungen Lars Beeck GmbH",
    "pageId": "108660497368036",
    "adAccountIds": []
  },
  {
    "id": "hausdeslebens",
    "name": "Haus des Lebens",
    "pageId": "108701800939526",
    "adAccountIds": []
  },
  {
    "id": "herzplus",
    "name": "Pflegedienst Herz Plus GmbH",
    "pageId": "109111530917504",
    "adAccountIds": []
  },
  {
    "id": "hibintensivpflege",
    "name": "HIB Intensivpflege UG",
    "pageId": "109785545405461",
    "adAccountIds": []
  },
  {
    "id": "huslichekrankenpflegeobe",
    "name": "Häusliche Krankenpflege Oberweser e.V.",
    "pageId": "109889952033286",
    "adAccountIds": []
  },
  {
    "id": "gewolfgeriatriccareco",
    "name": "Gewolf-Geriatric-Care GmbH & Co. KG",
    "pageId": "110400830803992",
    "adAccountIds": []
  },
  {
    "id": "radugapflegesozialediens",
    "name": "Raduga Pflege & soziale Dienstleistungen GmbH",
    "pageId": "110745021868963",
    "adAccountIds": []
  },
  {
    "id": "idhegauost",
    "name": "Id-Pflegedienst Hegau-Ost",
    "pageId": "110790665312018",
    "adAccountIds": []
  },
  {
    "id": "kiwaoptik",
    "name": "Kiwa Optik",
    "pageId": "112506183477341",
    "adAccountIds": []
  },
  {
    "id": "caritasaltenpflegeheimun",
    "name": "Caritas Altenpflegeheim und Tagespflege St. Hedwig Wurzen",
    "pageId": "112901593905944",
    "adAccountIds": []
  },
  {
    "id": "iph24gmbh",
    "name": "iph24gmbh",
    "pageId": "113749763866888",
    "adAccountIds": []
  },
  {
    "id": "asbcoburg2",
    "name": "ASB Coburg",
    "pageId": "114838818691479",
    "adAccountIds": []
  },
  {
    "id": "benedicare",
    "name": "BenediCare GmbH",
    "pageId": "115240291655759",
    "adAccountIds": []
  },
  {
    "id": "freinanderundnachbarscha",
    "name": "Für-einander Pflegedienst und Nachbarschaftshilfe e.V.",
    "pageId": "117102871403517",
    "adAccountIds": []
  },
  {
    "id": "pflegeheimlutherstiftggm",
    "name": "Ev. Pflegeheim Lutherstift Ggmbh",
    "pageId": "117152568969305",
    "adAccountIds": []
  },
  {
    "id": "pflegelaune",
    "name": "Pflegelaune",
    "pageId": "117895484629912",
    "adAccountIds": []
  },
  {
    "id": "servicehaussonnenhaldesh",
    "name": "Servicehaus Sonnenhalde - SHS",
    "pageId": "124157757335861",
    "adAccountIds": []
  },
  {
    "id": "immofinest",
    "name": "Immofinest",
    "pageId": "126968717063127",
    "adAccountIds": [
      "act_1512844659483848"
    ]
  },
  {
    "id": "huslichekrankenpflegeker",
    "name": "Häusliche Krankenpflege Kerstin Effe",
    "pageId": "129284837141001",
    "adAccountIds": []
  },
  {
    "id": "vitawohlkrankenpflege",
    "name": "VitaWohl Krankenpflege GmbH ",
    "pageId": "142221652302652",
    "adAccountIds": []
  },
  {
    "id": "sonnenschein",
    "name": "Pflegedienst Sonnenschein GmbH",
    "pageId": "153364274847212",
    "adAccountIds": []
  },
  {
    "id": "dielebensgestalter",
    "name": "Die Lebensgestalter",
    "pageId": "163104916888235",
    "adAccountIds": []
  },
  {
    "id": "etgbr",
    "name": "E&T GbR Pflegedienst",
    "pageId": "173667159152844",
    "adAccountIds": []
  },
  {
    "id": "impuls",
    "name": "Impuls Pflegedienst",
    "pageId": "175897359178634",
    "adAccountIds": []
  },
  {
    "id": "dersegenpflegeniddatal",
    "name": "Der Segen - ambulante Pflege Niddatal",
    "pageId": "180201341849938",
    "adAccountIds": []
  },
  {
    "id": "fachkrankenpflegegenger",
    "name": "Fachkrankenpflege Genger",
    "pageId": "183108342577758",
    "adAccountIds": []
  },
  {
    "id": "itshome",
    "name": "ITS Home",
    "pageId": "203358873124996",
    "adAccountIds": []
  },
  {
    "id": "amwasserturm",
    "name": "Residenz am Wasserturm ",
    "pageId": "205174749346117",
    "adAccountIds": [
      "act_331461329720362"
    ]
  },
  {
    "id": "tapflegedresdenintensivp",
    "name": "T&A Pflege Dresden Intensivpflege",
    "pageId": "209296535611060",
    "adAccountIds": [
      "act_1098067398096417"
    ]
  },
  {
    "id": "eigenbetrieblebenundwohn",
    "name": "Eigenbetrieb Leben und Wohnen der Landeshauptstadt Stuttgart",
    "pageId": "216102891786843",
    "adAccountIds": []
  },
  {
    "id": "lahndill",
    "name": "Pflegedienst Lahn-Dill",
    "pageId": "228221780383929",
    "adAccountIds": []
  },
  {
    "id": "mila",
    "name": "Ambulanter Pflegedienst Mila",
    "pageId": "234877393051806",
    "adAccountIds": []
  },
  {
    "id": "klinikenerlabrunn",
    "name": "Kliniken Erlabrunn",
    "pageId": "241444039043664",
    "adAccountIds": []
  },
  {
    "id": "regiopflegedienstklauskl",
    "name": "Regiopflegedienst Klaus Klee GmbH",
    "pageId": "284473251413206",
    "adAccountIds": []
  },
  {
    "id": "deutscheskryptobildungsi",
    "name": "Deutsches Krypto Bildungsinstitut",
    "pageId": "302701752927422",
    "adAccountIds": []
  },
  {
    "id": "salutiscare",
    "name": "Salutis Care",
    "pageId": "303956216134358",
    "adAccountIds": []
  },
  {
    "id": "pflegezentrummuldentalfa",
    "name": "PflegeZentrum Muldentalfamilie",
    "pageId": "337859156360906",
    "adAccountIds": []
  },
  {
    "id": "awokreisverbandgreiz",
    "name": "AWO Kreisverband Greiz e.V.",
    "pageId": "344291932101745",
    "adAccountIds": []
  },
  {
    "id": "weltenbrechershopwittenb",
    "name": "Weltenbrecher Shop Wittenberg",
    "pageId": "372053215987681",
    "adAccountIds": [
      "act_1469347730351826"
    ]
  },
  {
    "id": "klinikumforchheimfrnkisc",
    "name": "Klinikum Forchheim - Fränkische Schweiz",
    "pageId": "381394732411435",
    "adAccountIds": []
  },
  {
    "id": "intensivpflegesecurusgbr",
    "name": "Intensivpflege Securus GbR",
    "pageId": "398007773395567",
    "adAccountIds": []
  },
  {
    "id": "huslichekrankenpflegesch",
    "name": "Häusliche Krankenpflege Schölzke GmbH",
    "pageId": "403288719710550",
    "adAccountIds": []
  },
  {
    "id": "krankenundbl",
    "name": "Ambulanter Kranken- und Pflegedienst B&L GmbH",
    "pageId": "420516004475181",
    "adAccountIds": []
  },
  {
    "id": "dahoam",
    "name": "Pflegedienst Dahoam GmbH",
    "pageId": "420520087816666",
    "adAccountIds": []
  },
  {
    "id": "schroeterambulant",
    "name": "Ambulanter Pflegedienst Schröter",
    "pageId": "427851957068178",
    "adAccountIds": []
  },
  {
    "id": "sempatikcarekrankenundin",
    "name": "Sempatik Care Kranken-und Intensivpflege GmbH",
    "pageId": "443906265479756",
    "adAccountIds": []
  },
  {
    "id": "karlundheinischgbr",
    "name": "Karl und Heinisch GbR",
    "pageId": "454581321064104",
    "adAccountIds": []
  },
  {
    "id": "arpflegendehnde",
    "name": "A+R Pflegende Hände GmbH",
    "pageId": "454649894908632",
    "adAccountIds": []
  },
  {
    "id": "pflegebetreuungpretzsch",
    "name": "Pflege- und Betreuungsdienst Pretzsch",
    "pageId": "466863809837081",
    "adAccountIds": []
  },
  {
    "id": "seniorenpflegeheimstelis",
    "name": "Senioren-Pflegeheim \"St. Elisabeth\" Köthen",
    "pageId": "469042639628442",
    "adAccountIds": []
  },
  {
    "id": "emtintensivpflegedienst",
    "name": "EMT Intensivpflegedienst GmbH",
    "pageId": "475858032284687",
    "adAccountIds": []
  },
  {
    "id": "klink",
    "name": "Pflegedienst Klink GmbH",
    "pageId": "481589095033628",
    "adAccountIds": []
  },
  {
    "id": "pflegezentrumlichtenfels",
    "name": "Pflegezentrum Lichtenfels",
    "pageId": "485191618021357",
    "adAccountIds": []
  },
  {
    "id": "lebendaheim",
    "name": "Pflegedienst Leben Daheim GmbH",
    "pageId": "488500117671266",
    "adAccountIds": []
  },
  {
    "id": "sanivacare",
    "name": "Saniva Care",
    "pageId": "491803004012466",
    "adAccountIds": []
  },
  {
    "id": "pflegebetreuungmueller",
    "name": "Pflege- und Betreuungsdienst Müller GmbH",
    "pageId": "504631706405466",
    "adAccountIds": [
      "act_813810813807537"
    ]
  },
  {
    "id": "baintensivpflege",
    "name": "B&A ambulante Intensivpflege",
    "pageId": "510981542090195",
    "adAccountIds": []
  },
  {
    "id": "aktivdahoam",
    "name": "Aktiv Dahoam GmbH",
    "pageId": "531759826899684",
    "adAccountIds": []
  },
  {
    "id": "tagespflegehausfanny",
    "name": "Tagespflegehaus-Fanny",
    "pageId": "543330998853576",
    "adAccountIds": []
  },
  {
    "id": "ehlersottenco",
    "name": "Ehlers-Otten GmbH & Co. KG",
    "pageId": "590740450779273",
    "adAccountIds": []
  },
  {
    "id": "miteinanderwohnen",
    "name": "Miteinander-Wohnen",
    "pageId": "606229825915429",
    "adAccountIds": [
      "act_9924443714305358"
    ]
  },
  {
    "id": "rundum24",
    "name": "Pflegedienst Rundum24 GmbH",
    "pageId": "618337912344678",
    "adAccountIds": []
  },
  {
    "id": "pflegestationadiuvo",
    "name": "Pflegestation Adiuvo GmbH",
    "pageId": "634008189788466",
    "adAccountIds": []
  },
  {
    "id": "caritasstjoseph",
    "name": "Caritas Altenpflegeheim St. Joseph Rathmannsdorf",
    "pageId": "641905719566986",
    "adAccountIds": []
  },
  {
    "id": "sozialstationkleinpartne",
    "name": "Sozialstation Klein & Partner",
    "pageId": "697283156791400",
    "adAccountIds": [
      "act_1368696404210842"
    ]
  },
  {
    "id": "hammonia",
    "name": "Pflegedienst Hammonia",
    "pageId": "743732779120695",
    "adAccountIds": []
  },
  {
    "id": "lisi",
    "name": "LiSi GmbH - Ambulanter Pflegedienst",
    "pageId": "769004332970127",
    "adAccountIds": []
  },
  {
    "id": "lebenswertwangen",
    "name": "Lebenswert-Wangen",
    "pageId": "777454305440715",
    "adAccountIds": []
  },
  {
    "id": "agvintensiv",
    "name": "AGV Intensiv",
    "pageId": "791166114234292",
    "adAccountIds": []
  },
  {
    "id": "metzgergutjahrstiftung",
    "name": "Metzger-Gutjahr-Stiftung e.V.",
    "pageId": "805670145963495",
    "adAccountIds": []
  },
  {
    "id": "bitzbildungsinstitutundt",
    "name": "BITZ- Bildungsinstitut und Therapeutisches Zentrum",
    "pageId": "833853043138803",
    "adAccountIds": []
  },
  {
    "id": "mobilepflegesunshine",
    "name": "Mobile Pflege Sunshine ",
    "pageId": "838093659390286",
    "adAccountIds": []
  },
  {
    "id": "mothivaintensivpflegedie",
    "name": "Mothiva Intensivpflegedienst GmbH",
    "pageId": "903179156221107",
    "adAccountIds": []
  },
  {
    "id": "daslbcke",
    "name": "Das Pflegeteam Lübcke",
    "pageId": "920003531204137",
    "adAccountIds": []
  },
  {
    "id": "hausmarinibrannenburg",
    "name": "Haus Marini Brannenburg",
    "pageId": "940194719180130",
    "adAccountIds": []
  },
  {
    "id": "diakonieflha",
    "name": "Diakonie Flöha",
    "pageId": "971147302746193",
    "adAccountIds": []
  },
  {
    "id": "herzhaltpforzheim",
    "name": "Herz & Halt Pflegedienst Pforzheim",
    "pageId": "1012368628634442",
    "adAccountIds": []
  },
  {
    "id": "eigenbetriebseniorenheim",
    "name": "Eigenbetrieb Seniorenheime des Landkreises Günzburg",
    "pageId": "1055827544558362",
    "adAccountIds": []
  },
  {
    "id": "curavigo",
    "name": "CuraVigo ",
    "pageId": "1081641858362260",
    "adAccountIds": []
  },
  {
    "id": "pflege20pflege",
    "name": "Pflege 2.0 GmbH - Ambulante Pflege",
    "pageId": "1106203566102707",
    "adAccountIds": []
  },
  {
    "id": "spektrum",
    "name": "Spektrum GmbH",
    "pageId": "1152274981500144",
    "adAccountIds": [
      "act_847088450949368"
    ]
  },
  {
    "id": "huslichekrankenpflegecan",
    "name": "Häusliche Krankenpflege Candidus UG",
    "pageId": "1215348088495609",
    "adAccountIds": []
  },
  {
    "id": "tagesundkurzzeitpflegehu",
    "name": "Tages und Kurzzeitpflege \"Hutznhaisl\" Illing",
    "pageId": "1230621950295601",
    "adAccountIds": []
  },
  {
    "id": "asbortsverbandriesa",
    "name": "ASB Ortsverband Riesa e.V.",
    "pageId": "1239105616153371",
    "adAccountIds": []
  },
  {
    "id": "stadtmissionnrnbergdiako",
    "name": "Stadtmission Nürnberg & Diakonie Erlangen",
    "pageId": "1528593214051822",
    "adAccountIds": []
  },
  {
    "id": "kiesl",
    "name": "Pflegedienst Kiesl",
    "pageId": "1593221047605426",
    "adAccountIds": []
  },
  {
    "id": "wieschoecare",
    "name": "WieSchoe Care GmbH",
    "pageId": "1605773909646184",
    "adAccountIds": []
  },
  {
    "id": "hauskrankentagespflegewe",
    "name": "Hauskranken- & Tagespflege Wehle/Kampfrath GmbH",
    "pageId": "1610721039141367",
    "adAccountIds": []
  },
  {
    "id": "aworottweilsozialedienst",
    "name": "AWO Rottweil Soziale Dienste gemeinnützige GmbH",
    "pageId": "1767267840242989",
    "adAccountIds": []
  },
  {
    "id": "teheimsolingen",
    "name": "Teheim Solingen",
    "pageId": "2027795880809967",
    "adAccountIds": []
  },
  {
    "id": "raphaelmacht",
    "name": "Raphael Macht",
    "pageId": "2225159464216481",
    "adAccountIds": []
  },
  {
    "id": "rheinischervereinfrkatho",
    "name": "Rheinischer Verein für Katholische Arbeiterkolonien e.V.",
    "pageId": "122097515870017040",
    "adAccountIds": []
  }
];

// nicht zugeordnet: Deutsches Kryptoinstitut (act_1261773034787136)
// nicht zugeordnet: Pflege Müller (act_7060367894022972)
// nicht zugeordnet: Gewolf Werbekonto (act_890601052405299)
// nicht zugeordnet: Auxilium Anhalt GmbH (act_1312705969084031)
// nicht zugeordnet: AWO Seniorenbetreuung Neustadt GmbH Wk2 (act_445873360362195)
// nicht zugeordnet: GEWOLF Andreas (act_1014045485853855)
// nicht zugeordnet: Illing Pflege (act_6510489675740456)
// nicht zugeordnet: KidsCare (act_1216705752686525)
// nicht zugeordnet: Pflegeheim Haus Kübler GmbH (act_567679896156181)
